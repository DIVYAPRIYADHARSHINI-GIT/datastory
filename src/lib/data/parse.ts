/**
 * File parsing - CSV via PapaParse, Excel via SheetJS (@e965/xlsx, the maintained fork).
 *
 * Everything runs in the browser; no bytes are ever uploaded. Both parsers are loaded
 * with dynamic `import()` so the ~700 KB Excel reader is not in the landing-page bundle.
 *
 * Large-file strategy:
 *  - CSV is parsed with `worker: true`, so a 50 MB file never blocks the UI thread.
 *  - Row count is capped at MAX_ROWS; beyond that we keep the first MAX_ROWS and report
 *    `truncated`, which the UI surfaces honestly instead of silently analysing a subset.
 */

import type { CellValue, RawTable } from '../types';

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_ROWS = 200_000;
export const PREVIEW_ROWS = 100;

export const CSV_EXTENSIONS = ['.csv', '.tsv', '.txt'];
export const EXCEL_EXTENSIONS = ['.xlsx', '.xls', '.xlsm'];
export const ACCEPTED_EXTENSIONS = [...CSV_EXTENSIONS, ...EXCEL_EXTENSIONS];

export class ParseError extends Error {
	readonly hint: string;
	constructor(message: string, hint = '') {
		super(message);
		this.name = 'ParseError';
		this.hint = hint;
	}
}

export type ParseOutcome = {
	table: RawTable;
	/** Sheet names when the source was a workbook with more than one usable sheet. */
	sheets?: string[];
	activeSheet?: string;
	truncated: boolean;
	/** Non-fatal parser notes (ragged rows, repaired quotes). */
	warnings: string[];
};

export function extensionOf(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function isExcel(name: string): boolean {
	return EXCEL_EXTENSIONS.includes(extensionOf(name));
}

/** Validate before reading a single byte, so errors are instant and specific. */
export function validateFile(file: File): void {
	const ext = extensionOf(file.name);
	if (!ext) {
		throw new ParseError(
			'That file has no extension, so DataStory cannot tell what format it is.',
			'Rename it to end in .csv, .xlsx or .xls and try again.'
		);
	}
	if (!ACCEPTED_EXTENSIONS.includes(ext)) {
		throw new ParseError(
			`DataStory cannot read ${ext} files.`,
			'Supported formats are .csv, .tsv, .xlsx, .xls and .xlsm. Export your file as CSV or Excel first.'
		);
	}
	if (file.size === 0) {
		throw new ParseError('That file is empty (0 bytes).', 'Check the file saved correctly, then upload it again.');
	}
	if (file.size > MAX_FILE_BYTES) {
		throw new ParseError(
			`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the 50 MB browser limit.`,
			'Everything is analysed on your device, so very large files run out of memory. Split it or filter some rows out first.'
		);
	}
}

/** Blank-row test used to skip padding rows the spreadsheet left behind. */
function isBlankRow(row: unknown[]): boolean {
	for (const v of row) {
		if (v === null || v === undefined) continue;
		if (typeof v === 'string' && v.trim() === '') continue;
		return false;
	}
	return true;
}

/**
 * Headers must be unique, non-empty strings - charts key off column names.
 * Blank headers become "Column 3"; duplicates get a numeric suffix.
 */
export function normalizeHeaders(raw: unknown[]): string[] {
	const seen = new Map<string, number>();
	return raw.map((h, i) => {
		let name = typeof h === 'string' ? h.trim() : h === null || h === undefined ? '' : String(h).trim();
		// Strip a UTF-8 BOM that survived the read.
		name = name.replace(/^\ufeff/, '');
		if (name === '') name = `Column ${i + 1}`;
		const hit = seen.get(name.toLowerCase());
		if (hit === undefined) {
			seen.set(name.toLowerCase(), 1);
			return name;
		}
		seen.set(name.toLowerCase(), hit + 1);
		return `${name} (${hit + 1})`;
	});
}

/** Pad/trim ragged rows so every row matches the header width. */
function squareOff(rows: CellValue[][], width: number): { rows: CellValue[][]; ragged: number } {
	let ragged = 0;
	const out: CellValue[][] = new Array(rows.length);
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (row.length === width) {
			out[i] = row;
			continue;
		}
		ragged++;
		if (row.length > width) out[i] = row.slice(0, width);
		else out[i] = [...row, ...new Array<CellValue>(width - row.length).fill(null)];
	}
	return { rows: out, ragged };
}

/**
 * Some exports put a title row above the real header ("Sales Report 2024", then blanks).
 * Pick the first row that has at least two non-empty cells AND is not mostly numeric,
 * since a numeric row is data, not a header.
 */
function findHeaderRow(rows: unknown[][]): number {
	for (let i = 0; i < Math.min(rows.length, 20); i++) {
		const row = rows[i];
		const filled = row.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
		if (filled.length < 2) continue;
		const numericCount = filled.filter((v) => typeof v === 'number' || /^-?[\d.,]+$/.test(String(v).trim())).length;
		if (numericCount / filled.length > 0.6) continue;
		return i;
	}
	return 0;
}

function finishTable(matrix: unknown[][], warnings: string[]): { table: RawTable; truncated: boolean } {
	const nonEmpty = matrix.filter((r) => !isBlankRow(r));
	if (nonEmpty.length === 0) {
		throw new ParseError(
			'That file has no readable rows.',
			'It may contain only formatting or images. Open it in a spreadsheet app and check there is a table of data.'
		);
	}

	const headerIndex = findHeaderRow(nonEmpty);
	if (headerIndex > 0) {
		warnings.push(`Skipped ${headerIndex} title row${headerIndex === 1 ? '' : 's'} above the header.`);
	}
	const headers = normalizeHeaders(nonEmpty[headerIndex] as unknown[]);
	if (headers.length === 0) {
		throw new ParseError('No columns found in that file.', 'Check the first row contains column names.');
	}

	let body = nonEmpty.slice(headerIndex + 1) as CellValue[][];
	const skippedEmptyRows = matrix.length - nonEmpty.length;

	let truncated = false;
	if (body.length > MAX_ROWS) {
		truncated = true;
		body = body.slice(0, MAX_ROWS);
		warnings.push(
			`Only the first ${MAX_ROWS.toLocaleString()} rows were analysed - the file is larger than one browser tab can hold.`
		);
	}

	const { rows, ragged } = squareOff(body, headers.length);
	if (ragged > 0) {
		warnings.push(
			`${ragged} row${ragged === 1 ? '' : 's'} had a different number of columns and ${ragged === 1 ? 'was' : 'were'} padded to fit.`
		);
	}

	if (rows.length === 0) {
		throw new ParseError(
			'That file has a header row but no data rows.',
			'Add at least one row of data below the column names.'
		);
	}

	return { table: { headers, rows, skippedEmptyRows }, truncated };
}

/**
 * Parse a CSV/TSV file without blocking the UI.
 *
 * NOT `worker: true`. PapaParse's worker mode loads a second copy of itself from its own
 * script URL, which does not exist in a bundled, hashed build - it throws
 * "Cannot read properties of undefined" the moment a real file is dropped. Instead the file
 * is streamed in chunks: PapaParse reads each chunk through FileReader and hands it back
 * asynchronously, so the event loop gets a turn between chunks and the page keeps painting.
 * `chunk` (not `step`) is used so the yield happens once per chunk rather than per row,
 * which is dramatically faster on a 50 MB file.
 */
export async function parseCsvFile(file: File): Promise<ParseOutcome> {
	const Papa = (await import('papaparse')).default;
	const warnings: string[] = [];

	const matrix = await new Promise<unknown[][]>((resolve, reject) => {
		const rows: unknown[][] = [];
		let aborted = false;

		Papa.parse<unknown[]>(file, {
			chunkSize: 1024 * 1024, // 1 MB per turn of the event loop
			skipEmptyLines: 'greedy',
			dynamicTyping: false, // we run our own, spreadsheet-aware coercion
			chunk: (results, parser) => {
				for (const row of results.data) {
					rows.push(row);
					// Stop reading once past the cap - no point loading 40 MB we will discard.
					if (rows.length > MAX_ROWS + 1) {
						aborted = true;
						parser.abort();
						return;
					}
				}
			},
			complete: () => resolve(rows),
			error: (err: Error) =>
				reject(
					new ParseError(
						`DataStory could not read that CSV: ${err.message}`,
						'Check the file is a plain text CSV and not a renamed spreadsheet.'
					)
				)
		});

		// `parser.abort()` resolves through `complete`, so nothing extra is needed here.
		void aborted;
	});

	const { table, truncated } = finishTable(matrix, warnings);
	return { table, truncated, warnings };
}

export type Workbook = {
	sheetNames: string[];
	read: (sheet: string) => ParseOutcome;
};

/**
 * Read an Excel workbook into memory and return a reader for each sheet.
 * The workbook object is kept so the sheet selector can switch sheets without re-reading
 * the file. `cellDates: true` gives real Date objects, which we convert to epoch ms.
 */
export async function openWorkbook(file: File): Promise<Workbook> {
	const XLSX = await import('@e965/xlsx');
	const buffer = await file.arrayBuffer();

	let workbook: import('@e965/xlsx').WorkBook;
	try {
		workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false, cellText: false });
	} catch (err) {
		throw new ParseError(
			'That Excel file could not be opened.',
			'It may be password-protected, corrupted, or saved in an old format. Try re-saving it as .xlsx or exporting to CSV.'
		);
	}

	const sheetNames = workbook.SheetNames.filter((name) => {
		const sheet = workbook.Sheets[name];
		return !!sheet && !!sheet['!ref'];
	});
	if (sheetNames.length === 0) {
		throw new ParseError(
			'That workbook has no sheets with any data in them.',
			'Open it in Excel, check a sheet has a table of data, and save again.'
		);
	}

	return {
		sheetNames,
		read(sheetName: string): ParseOutcome {
			const sheet = workbook.Sheets[sheetName];
			if (!sheet) {
				throw new ParseError(`Sheet "${sheetName}" is not in this workbook.`);
			}
			const warnings: string[] = [];
			const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
				header: 1,
				blankrows: false,
				defval: null,
				raw: true
			});
			// Dates arrive as Date objects with cellDates: true - store epoch ms.
			const normalized = matrix.map((row) =>
				(row as unknown[]).map((v) => (v instanceof Date ? v.getTime() : (v as CellValue)))
			);
			const { table, truncated } = finishTable(normalized, warnings);
			return {
				table,
				truncated,
				warnings,
				sheets: sheetNames.length > 1 ? sheetNames : undefined,
				activeSheet: sheetName
			};
		}
	};
}

/** Parse any supported file. For multi-sheet workbooks the first sheet is returned. */
export async function parseFile(file: File): Promise<ParseOutcome & { workbook?: Workbook }> {
	validateFile(file);
	if (isExcel(file.name)) {
		const workbook = await openWorkbook(file);
		const outcome = workbook.read(workbook.sheetNames[0]);
		return { ...outcome, workbook };
	}
	return parseCsvFile(file);
}

/** Parse CSV text that is already in memory (sample datasets). */
export async function parseCsvText(text: string): Promise<ParseOutcome> {
	const Papa = (await import('papaparse')).default;
	const warnings: string[] = [];
	const result = Papa.parse<unknown[]>(text, {
		skipEmptyLines: 'greedy',
		dynamicTyping: false
	});
	const { table, truncated } = finishTable(result.data, warnings);
	return { table, truncated, warnings };
}
