/**
 * One-click cleaning actions.
 *
 * Every action is a pure function `(Dataset) -> CleanResult` that returns a NEW dataset plus
 * a CleanStep describing exactly what changed, so the UI can show a before/after summary and
 * the saved dashboard can explain how the data was prepared. Nothing mutates its input.
 */

import type {
	CellValue,
	CleanAction,
	CleanResult,
	CleanStep,
	Dataset,
	FillStrategy
} from '../types';
import { isMissing, parseDate } from './detect';
import { findDuplicateRows, findEmptyRows } from './quality';
import { mode, resummarize } from './stats';

function step(action: CleanAction, label: string, rowsRemoved: number, cellsChanged: number): CleanStep {
	return { action, label, rowsRemoved, cellsChanged, at: Date.now() };
}

export function removeDuplicates(dataset: Dataset): CleanResult {
	const dupes = new Set(findDuplicateRows(dataset));
	if (dupes.size === 0) {
		return {
			dataset,
			step: step({ id: 'remove-duplicates' }, 'No duplicate rows to remove', 0, 0)
		};
	}
	const rows = dataset.rows.filter((_, i) => !dupes.has(i));
	return {
		dataset: resummarize(dataset, rows),
		step: step(
			{ id: 'remove-duplicates' },
			`Removed ${dupes.size} duplicate row${dupes.size === 1 ? '' : 's'}`,
			dupes.size,
			0
		)
	};
}

export function dropEmptyRows(dataset: Dataset): CleanResult {
	const empty = new Set(findEmptyRows(dataset));
	if (empty.size === 0) {
		return { dataset, step: step({ id: 'drop-empty-rows' }, 'No empty rows to drop', 0, 0) };
	}
	const rows = dataset.rows.filter((_, i) => !empty.has(i));
	return {
		dataset: resummarize(dataset, rows),
		step: step(
			{ id: 'drop-empty-rows' },
			`Dropped ${empty.size} empty row${empty.size === 1 ? '' : 's'}`,
			empty.size,
			0
		)
	};
}

/** Trim ends and collapse runs of inner whitespace so "North  " and "North" merge. */
export function trimSpaces(dataset: Dataset): CleanResult {
	let cellsChanged = 0;
	const rows = dataset.rows.map((row) => {
		let touched = false;
		const copy = row.map((v) => {
			if (typeof v !== 'string') return v;
			const next = v.trim().replace(/\s+/g, ' ');
			if (next !== v) {
				cellsChanged++;
				touched = true;
			}
			return next;
		});
		return touched ? copy : row;
	});
	if (cellsChanged === 0) {
		return { dataset, step: step({ id: 'trim-spaces' }, 'No extra spaces found', 0, 0) };
	}
	return {
		dataset: resummarize(dataset, rows),
		step: step({ id: 'trim-spaces' }, `Trimmed ${cellsChanged} cells`, 0, cellsChanged)
	};
}

/**
 * Re-read every value in each date column with one consistent order.
 * Values already stored as epoch ms pass through; strings that were left unparsed by a
 * mid-column format change get a second attempt with both day-first and month-first.
 */
export function standardizeDates(dataset: Dataset): CleanResult {
	const dateColumns = dataset.columns.filter((c) => c.type === 'date');
	if (dateColumns.length === 0) {
		return {
			dataset,
			step: step({ id: 'standardize-dates' }, 'No date columns to standardize', 0, 0)
		};
	}
	let cellsChanged = 0;
	const rows = dataset.rows.map((row) => {
		const copy = [...row];
		for (const col of dateColumns) {
			const v = row[col.index];
			if (typeof v === 'number' || isMissing(v)) continue;
			const parsed = parseDate(v, true) ?? parseDate(v, false);
			if (parsed !== null) {
				copy[col.index] = parsed;
				cellsChanged++;
			}
		}
		return copy;
	});
	if (cellsChanged === 0) {
		return {
			dataset,
			step: step({ id: 'standardize-dates' }, 'All dates already use one format', 0, 0)
		};
	}
	return {
		dataset: resummarize(dataset, rows),
		step: step(
			{ id: 'standardize-dates' },
			`Standardized ${cellsChanged} date value${cellsChanged === 1 ? '' : 's'}`,
			0,
			cellsChanged
		)
	};
}

const STRATEGY_LABEL: Record<FillStrategy, string> = {
	mean: 'the column mean',
	median: 'the column median',
	mode: 'the most common value',
	zero: 'zero',
	'drop-row': 'dropping the row'
};

/**
 * Fill missing values.
 *
 * mean/median only apply to number columns; mode applies to any column; zero applies to
 * numbers. Text and category columns under mean/median/zero fall back to mode, because
 * leaving them blank silently would contradict the button the user pressed.
 * `drop-row` removes any row with a missing value in the selected columns.
 */
export function fillMissing(
	dataset: Dataset,
	strategy: FillStrategy,
	columnNames?: string[]
): CleanResult {
	const targets = dataset.columns.filter(
		(c) => !columnNames || columnNames.length === 0 || columnNames.includes(c.name)
	);
	const action: CleanAction = { id: 'fill-missing', strategy, columns: columnNames };

	if (strategy === 'drop-row') {
		const keep: CellValue[][] = [];
		let removed = 0;
		for (const row of dataset.rows) {
			const hasGap = targets.some((c) => isMissing(row[c.index]));
			if (hasGap) removed++;
			else keep.push(row);
		}
		if (removed === 0) {
			return { dataset, step: step(action, 'No rows had missing values', 0, 0) };
		}
		return {
			dataset: resummarize(dataset, keep),
			step: step(action, `Dropped ${removed} row${removed === 1 ? '' : 's'} with missing values`, removed, 0)
		};
	}

	// Pre-compute one replacement value per column so the fill is a single pass.
	const replacements = new Map<number, CellValue>();
	for (const col of targets) {
		if (col.missing === 0) continue;
		let value: CellValue = null;
		if (col.type === 'number') {
			if (strategy === 'mean') value = col.numeric ? round(col.numeric.mean) : 0;
			else if (strategy === 'median') value = col.numeric ? round(col.numeric.median) : 0;
			else if (strategy === 'zero') value = 0;
			else value = mode(dataset.rows.map((r) => r[col.index]));
		} else if (col.type === 'date') {
			// Never invent a date from an average - mode is the only defensible fill.
			value = mode(dataset.rows.map((r) => r[col.index]));
		} else if (col.type === 'boolean') {
			value = strategy === 'zero' ? false : mode(dataset.rows.map((r) => r[col.index]));
		} else {
			value = strategy === 'zero' ? '0' : mode(dataset.rows.map((r) => r[col.index]));
		}
		if (value !== null && value !== undefined) replacements.set(col.index, value);
	}

	if (replacements.size === 0) {
		return { dataset, step: step(action, 'Nothing to fill', 0, 0) };
	}

	let cellsChanged = 0;
	const rows = dataset.rows.map((row) => {
		let touched = false;
		const copy = [...row];
		for (const [index, value] of replacements) {
			if (isMissing(copy[index])) {
				copy[index] = value;
				cellsChanged++;
				touched = true;
			}
		}
		return touched ? copy : row;
	});

	if (cellsChanged === 0) {
		return { dataset, step: step(action, 'No missing values left to fill', 0, 0) };
	}
	return {
		dataset: resummarize(dataset, rows),
		step: step(
			action,
			`Filled ${cellsChanged} missing value${cellsChanged === 1 ? '' : 's'} with ${STRATEGY_LABEL[strategy]}`,
			0,
			cellsChanged
		)
	};
}

function round(n: number): number {
	return Math.round(n * 1e4) / 1e4;
}

/** Dispatch a CleanAction. Single switch keeps the UI free of per-action wiring. */
export function applyCleanAction(dataset: Dataset, action: CleanAction): CleanResult {
	switch (action.id) {
		case 'remove-duplicates':
			return removeDuplicates(dataset);
		case 'drop-empty-rows':
			return dropEmptyRows(dataset);
		case 'trim-spaces':
			return trimSpaces(dataset);
		case 'standardize-dates':
			return standardizeDates(dataset);
		case 'fill-missing':
			return fillMissing(dataset, action.strategy, action.columns);
	}
}

/**
 * "Clean everything" - the order matters: structural fixes first (empty rows, trim,
 * date normalisation), then duplicates (trimming can reveal new duplicates), then fills.
 */
export function autoClean(dataset: Dataset): { dataset: Dataset; steps: CleanStep[] } {
	const sequence: CleanAction[] = [
		{ id: 'drop-empty-rows' },
		{ id: 'trim-spaces' },
		{ id: 'standardize-dates' },
		{ id: 'remove-duplicates' },
		{ id: 'fill-missing', strategy: 'median' }
	];
	let current = dataset;
	const steps: CleanStep[] = [];
	for (const action of sequence) {
		const result = applyCleanAction(current, action);
		current = result.dataset;
		if (result.step.rowsRemoved > 0 || result.step.cellsChanged > 0) steps.push(result.step);
	}
	return { dataset: current, steps };
}

/** Export the dataset back to CSV text (cleaned data download). */
export function toCsv(dataset: Dataset, formatDate: (ms: number) => string): string {
	const esc = (value: string): string =>
		/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

	const lines: string[] = [dataset.columns.map((c) => esc(c.name)).join(',')];
	for (const row of dataset.rows) {
		const cells = dataset.columns.map((col) => {
			const v = row[col.index];
			if (v === null || v === undefined) return '';
			if (col.type === 'date' && typeof v === 'number') return esc(formatDate(v));
			if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
			return esc(String(v));
		});
		lines.push(cells.join(','));
	}
	// Excel needs the BOM to read UTF-8 CSV correctly.
	return `\ufeff${lines.join('\r\n')}\r\n`;
}
