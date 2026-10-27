/**
 * Column type detection.
 *
 * Detection is deliberately conservative and explainable:
 *   1. Sample up to SAMPLE_SIZE non-empty values (stratified across the table, not just the
 *      first N rows, so a column that only becomes dirty near the bottom is still caught).
 *   2. Score each candidate type by the share of sample values it can parse.
 *   3. The winner needs >= CONFIDENCE_FLOOR of the sample; otherwise the column is text.
 *   4. Numbers with very low cardinality and text with low cardinality become `category`,
 *      because that is what makes them useful as a "group by" in a dashboard.
 *
 * Parsed values are normalised in place by `coerceDataset`: dates become epoch ms,
 * numbers become real numbers (currency symbols, thousands separators and % stripped),
 * booleans become true/false. Everything downstream can then assume clean types.
 */

import type { CellValue, ColumnType, RawTable } from '../types';

const SAMPLE_SIZE = 1000;
const CONFIDENCE_FLOOR = 0.8;
/** A numeric column with no more than this many distinct values behaves like a category. */
const NUMERIC_CATEGORY_MAX_DISTINCT = 12;
/** Text is a category when distinct values stay under this count AND this share of rows. */
const TEXT_CATEGORY_MAX_DISTINCT = 50;
const TEXT_CATEGORY_MAX_RATIO = 0.5;
/** Below this many sampled values, a distinct RATIO is meaningless - use a count instead. */
const SMALL_SAMPLE_ROWS = 20;

const MISSING_TOKENS = new Set([
	'',
	'-',
	'--',
	'n/a',
	'na',
	'n.a.',
	'null',
	'nil',
	'none',
	'nan',
	'undefined',
	'#n/a',
	'#div/0!',
	'#value!',
	'?',
	'.'
]);

const TRUE_TOKENS = new Set(['true', 'yes', 'y', 't', '1', 'on', 'active']);
const FALSE_TOKENS = new Set(['false', 'no', 'n', 'f', '0', 'off', 'inactive']);

/** Currency symbols we strip before trying to read a number. */
const CURRENCY = /[₹$€£¥₩₽¢]/g;

/** A value that means "nothing is here". */
export function isMissing(value: CellValue): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'number') return !Number.isFinite(value);
	if (typeof value === 'boolean') return false;
	return MISSING_TOKENS.has(value.trim().toLowerCase());
}

/**
 * Parse a number the way a spreadsheet user expects:
 *   "1,234.50" -> 1234.5, "₹2,500" -> 2500, "(350)" -> -350, "42%" -> 42, "1.2e3" -> 1200
 * Returns null when the text is not a number.
 */
export function parseNumber(value: CellValue): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'boolean') return null;
	if (value === null) return null;
	let text = value.trim();
	if (text === '' || MISSING_TOKENS.has(text.toLowerCase())) return null;

	let negative = false;
	// Accounting negatives: (1,200)
	if (text.startsWith('(') && text.endsWith(')')) {
		negative = true;
		text = text.slice(1, -1);
	}
	text = text.replace(CURRENCY, '').trim();
	const percent = text.endsWith('%');
	if (percent) text = text.slice(0, -1).trim();

	// Reject anything with letters other than a single exponent marker.
	if (/[a-df-zA-DF-Z]/.test(text)) return null;
	// Thousands separators: 1,234,567.89 or 1 234 567,89 (European)
	if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) {
		text = text.replace(/\./g, '').replace(',', '.');
	} else {
		text = text.replace(/,/g, '').replace(/\s|_/g, '');
	}
	if (text === '' || text === '-' || text === '+') return null;
	if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text)) return null;
	const n = Number(text);
	if (!Number.isFinite(n)) return null;
	return negative ? -n : n;
}

export function parseBoolean(value: CellValue): boolean | null {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') {
		if (value === 1) return true;
		if (value === 0) return false;
		return null;
	}
	if (value === null) return null;
	const token = value.trim().toLowerCase();
	if (TRUE_TOKENS.has(token)) return true;
	if (FALSE_TOKENS.has(token)) return false;
	return null;
}

const MONTH_NAMES: Record<string, number> = {
	jan: 0,
	january: 0,
	feb: 1,
	february: 1,
	mar: 2,
	march: 2,
	apr: 3,
	april: 3,
	may: 4,
	jun: 5,
	june: 5,
	jul: 6,
	july: 6,
	aug: 7,
	august: 7,
	sep: 8,
	sept: 8,
	september: 8,
	oct: 9,
	october: 9,
	nov: 10,
	november: 10,
	dec: 11,
	december: 11
};

function utc(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): number | null {
	if (m < 0 || m > 11) return null;
	if (d < 1 || d > 31) return null;
	const ms = Date.UTC(y, m, d, hh, mm, ss);
	const back = new Date(ms);
	// Reject 31 Feb style overflow.
	if (back.getUTCMonth() !== m || back.getUTCDate() !== d) return null;
	return ms;
}

/**
 * Parse a date into epoch ms (UTC midnight for date-only values).
 *
 * Supports ISO (2024-03-14, with optional time), d/m/y and m/d/y with - / or .,
 * "14 Mar 2024", "Mar 14, 2024", "2024-W12", "Q1 2024" and Excel serial numbers.
 * `preferDMY` resolves the genuinely ambiguous 03/04/2024 case; callers pass the
 * order that won across the whole column so one column never mixes both readings.
 */
export function parseDate(value: CellValue, preferDMY = true): number | null {
	if (typeof value === 'boolean' || value === null) return null;

	if (typeof value === 'number') {
		// Excel serial date: days since 1899-12-30. Only treat plausible ranges as dates.
		if (value > 59 && value < 80000 && Number.isFinite(value)) {
			const ms = Math.round((value - 25569) * 86400000);
			return ms;
		}
		return null;
	}

	const text = value.trim();
	if (text === '' || MISSING_TOKENS.has(text.toLowerCase())) return null;
	// Pure integers are numbers, not dates (years handled by the detector separately).
	if (/^\d{1,3}$/.test(text)) return null;

	// ISO: 2024-03-14 / 2024-03-14T08:30:00 / 2024/03/14
	let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
	if (m) {
		return utc(
			Number(m[1]),
			Number(m[2]) - 1,
			Number(m[3]),
			Number(m[4] ?? 0),
			Number(m[5] ?? 0),
			Number(m[6] ?? 0)
		);
	}

	// Year-month only: 2024-03
	m = text.match(/^(\d{4})[-/](\d{1,2})$/);
	if (m) return utc(Number(m[1]), Number(m[2]) - 1, 1);

	// ISO week: 2024-W12
	m = text.match(/^(\d{4})-?W(\d{1,2})$/i);
	if (m) {
		const jan4 = Date.UTC(Number(m[1]), 0, 4);
		const dow = (new Date(jan4).getUTCDay() + 6) % 7;
		return jan4 - dow * 86400000 + (Number(m[2]) - 1) * 7 * 86400000;
	}

	// Quarter: Q1 2024 / 2024 Q1
	m = text.match(/^Q([1-4])[\s-]?(\d{4})$/i) ?? text.match(/^(\d{4})[\s-]?Q([1-4])$/i);
	if (m) {
		const q = /^Q/i.test(text) ? Number(m[1]) : Number(m[2]);
		const y = /^Q/i.test(text) ? Number(m[2]) : Number(m[1]);
		return utc(y, (q - 1) * 3, 1);
	}

	// d/m/y or m/d/y with 2- or 4-digit year.
	// The year alternation must try 4 digits FIRST - `\d{2}|\d{4}` would match "20" out of
	// "2024" and silently read 14/03/2024 as 14 March 2020.
	m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
	if (m) {
		const a = Number(m[1]);
		const b = Number(m[2]);
		let y = Number(m[3]);
		if (y < 100) y += y < 50 ? 2000 : 1900;
		const hh = Number(m[4] ?? 0);
		const mm = Number(m[5] ?? 0);
		const ss = Number(m[6] ?? 0);
		// Unambiguous cases win regardless of preference.
		if (a > 12 && b <= 12) return utc(y, b - 1, a, hh, mm, ss);
		if (b > 12 && a <= 12) return utc(y, a - 1, b, hh, mm, ss);
		return preferDMY ? utc(y, b - 1, a, hh, mm, ss) : utc(y, a - 1, b, hh, mm, ss);
	}

	// 14 Mar 2024 / 14-March-2024
	m = text.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{2,4})$/);
	if (m) {
		const month = MONTH_NAMES[m[2].toLowerCase()];
		if (month === undefined) return null;
		let y = Number(m[3]);
		if (y < 100) y += y < 50 ? 2000 : 1900;
		return utc(y, month, Number(m[1]));
	}

	// Mar 14, 2024 / March 2024
	m = text.match(/^([A-Za-z]{3,9})[\s-](\d{1,2}),?[\s-](\d{2,4})$/);
	if (m) {
		const month = MONTH_NAMES[m[1].toLowerCase()];
		if (month === undefined) return null;
		let y = Number(m[3]);
		if (y < 100) y += y < 50 ? 2000 : 1900;
		return utc(y, month, Number(m[2]));
	}
	m = text.match(/^([A-Za-z]{3,9})[\s-](\d{4})$/);
	if (m) {
		const month = MONTH_NAMES[m[1].toLowerCase()];
		if (month === undefined) return null;
		return utc(Number(m[2]), month, 1);
	}

	return null;
}

/** True when a d/m/y-style string could only be read as day-first. */
function impliesDayFirst(text: string): boolean {
	const m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})/);
	return !!m && Number(m[1]) > 12 && Number(m[2]) <= 12;
}
function impliesMonthFirst(text: string): boolean {
	const m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})/);
	return !!m && Number(m[2]) > 12 && Number(m[1]) <= 12;
}

/** Column-name hints nudge borderline columns in the right direction. */
const ID_NAME = /(^|[\s_-])(id|uuid|guid|code|sku|ref|reference|number|no\.?|phone|mobile|zip|pin ?code|invoice)([\s_-]|$)/i;
const DATE_NAME = /(date|time|day|month|year|period|timestamp|created|updated|joined|dob|start|end)/i;

export type DetectionResult = {
	type: ColumnType;
	confidence: number;
	preferDMY: boolean;
	/** True when the column holds d/m/y and m/d/y readings at once. */
	mixedDateOrder: boolean;
};

/**
 * Stratified sample so dirt anywhere in a tall column is visible.
 *
 * The stride must be `ceil(total / SAMPLE_SIZE)`, not `floor`: with 1,500 rows, floor gives
 * a stride of 1, which walks only the first 1,000 rows and completely misses a column that
 * turns dirty near the bottom. ceil guarantees the walk spans the whole table.
 */
function sampleValues(rows: CellValue[][], index: number): CellValue[] {
	const total = rows.length;
	const out: CellValue[] = [];
	if (total === 0) return out;
	const step = total <= SAMPLE_SIZE ? 1 : Math.ceil(total / SAMPLE_SIZE);
	for (let i = 0; i < total && out.length < SAMPLE_SIZE; i += step) {
		const v = rows[i][index];
		if (!isMissing(v)) out.push(v);
	}
	// Top up from the tail only when the stride actually skipped rows. Doing it
	// unconditionally would re-add rows already sampled and halve the distinct ratio,
	// which makes unique identifier columns look like low-cardinality categories.
	if (step > 1) {
		for (let i = total - 1; i >= 0 && out.length < Math.min(SAMPLE_SIZE, 50); i--) {
			const v = rows[i][index];
			if (!isMissing(v)) out.push(v);
		}
	}
	return out;
}

export function detectColumnType(
	name: string,
	rows: CellValue[][],
	index: number
): DetectionResult {
	const sample = sampleValues(rows, index);
	if (sample.length === 0) {
		return { type: 'text', confidence: 0, preferDMY: true, mixedDateOrder: false };
	}

	let numberHits = 0;
	let boolHits = 0;
	let dayFirstVotes = 0;
	let monthFirstVotes = 0;
	const distinct = new Set<string>();

	for (const v of sample) {
		if (parseNumber(v) !== null) numberHits++;
		if (parseBoolean(v) !== null) boolHits++;
		if (typeof v === 'string') {
			if (impliesDayFirst(v)) dayFirstVotes++;
			else if (impliesMonthFirst(v)) monthFirstVotes++;
		}
		distinct.add(String(v).trim().toLowerCase());
	}

	const preferDMY = monthFirstVotes > dayFirstVotes ? false : true;
	const mixedDateOrder = dayFirstVotes > 0 && monthFirstVotes > 0;

	let dateHits = 0;
	for (const v of sample) if (parseDate(v, preferDMY) !== null) dateHits++;

	const n = sample.length;
	const numberShare = numberHits / n;
	const boolShare = boolHits / n;
	const dateShare = dateHits / n;
	const distinctRatio = distinct.size / n;

	// Booleans first: a yes/no column also parses as "category", but boolean is more precise.
	if (boolShare >= CONFIDENCE_FLOOR && distinct.size <= 3) {
		return { type: 'boolean', confidence: boolShare, preferDMY, mixedDateOrder };
	}

	// Dates beat numbers when the text clearly looks like a date, or the name says so.
	const nameSaysDate = DATE_NAME.test(name);
	if (dateShare >= CONFIDENCE_FLOOR && (dateShare >= numberShare || nameSaysDate)) {
		return { type: 'date', confidence: dateShare, preferDMY, mixedDateOrder };
	}

	if (numberShare >= CONFIDENCE_FLOOR) {
		// A 4-digit-year column named "Year" is more useful as a date axis.
		if (nameSaysDate && distinct.size > 1 && [...distinct].every((d) => /^(19|20)\d{2}$/.test(d))) {
			return { type: 'date', confidence: 0.9, preferDMY, mixedDateOrder: false };
		}
		// Identifiers are not measures - never average an invoice number.
		if (ID_NAME.test(name) && distinctRatio > 0.8) {
			return { type: 'text', confidence: numberShare, preferDMY, mixedDateOrder };
		}
		if (distinct.size <= NUMERIC_CATEGORY_MAX_DISTINCT && distinct.size < n * 0.5) {
			// Small integer code sets (ratings 1-5, store 1-8) group better than they sum.
			const allInts = [...distinct].every((d) => /^-?\d+$/.test(d));
			if (allInts) return { type: 'category', confidence: numberShare, preferDMY, mixedDateOrder };
		}
		return { type: 'number', confidence: numberShare, preferDMY, mixedDateOrder };
	}

	if (dateShare >= 0.6) {
		return { type: 'date', confidence: dateShare, preferDMY, mixedDateOrder };
	}

	// Text: category when it is low-cardinality enough to group by.
	//
	// The distinct-ratio test only means anything once there are enough rows to measure a
	// ratio. In a 5-row table, 3 regions is a 0.6 ratio but obviously still a category, so
	// small samples fall back to an absolute distinct-count test instead.
	const isCategory =
		!ID_NAME.test(name) &&
		distinct.size <= TEXT_CATEGORY_MAX_DISTINCT &&
		(n < SMALL_SAMPLE_ROWS
			? distinct.size <= Math.max(2, Math.ceil(n * 0.8))
			: distinctRatio <= TEXT_CATEGORY_MAX_RATIO);
	return {
		type: isCategory ? 'category' : 'text',
		confidence: isCategory ? 1 - distinctRatio : Math.max(0.5, 1 - distinctRatio),
		preferDMY,
		mixedDateOrder
	};
}

/**
 * Convert a raw cell into the canonical representation for a given type.
 * Returns null when the value cannot be represented (which counts as missing).
 */
export function coerceValue(
	value: CellValue,
	type: ColumnType,
	preferDMY = true
): CellValue {
	if (isMissing(value)) return null;
	switch (type) {
		case 'number':
			return parseNumber(value);
		case 'date':
			return parseDate(value, preferDMY);
		case 'boolean':
			return parseBoolean(value);
		case 'category':
		case 'text':
		default:
			// Deliberately NOT trimmed. Silently normalising whitespace here would hide the
			// problem: the quality panel could not report " North " vs "North" splitting a
			// category in two, the health score could not deduct for it, and the "Trim extra
			// spaces" action would have nothing to do. Cleaning is an explicit, visible step.
			return value;
	}
}

export type DetectedColumn = {
	name: string;
	index: number;
	type: ColumnType;
	confidence: number;
	preferDMY: boolean;
	mixedDateOrder: boolean;
};

/** Detect every column of a raw table. */
export function detectColumns(table: RawTable): DetectedColumn[] {
	return table.headers.map((name, index) => {
		const result = detectColumnType(name, table.rows, index);
		return { name, index, ...result };
	});
}
