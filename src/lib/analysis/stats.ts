/**
 * Descriptive statistics and the Dataset builder.
 *
 * `buildDataset` is the single entry point that turns a RawTable + detected types into a
 * fully coerced, fully summarised Dataset. Summaries are computed once here and reused by
 * the preview table, quality report, chart suggester and insight generator, so a 50k-row
 * file is only swept a couple of times.
 */

import type {
	CategorySummary,
	CellValue,
	Column,
	ColumnType,
	Dataset,
	DateSummary,
	NumericSummary,
	RawTable
} from '../types';
import { coerceValue, detectColumns, isMissing, type DetectedColumn } from './detect';

const MAX_TRACKED_OUTLIERS = 500;
const MAX_TRACKED_CATEGORIES = 5000;

export function mean(values: number[]): number {
	if (values.length === 0) return 0;
	let sum = 0;
	for (const v of values) sum += v;
	return sum / values.length;
}

/** Linear-interpolated quantile on an already-sorted array. */
export function quantileSorted(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0];
	const pos = (sorted.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	if (lo === hi) return sorted[lo];
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return quantileSorted(sorted, 0.5);
}

export function stdDev(values: number[], avg = mean(values)): number {
	if (values.length < 2) return 0;
	let acc = 0;
	for (const v of values) acc += (v - avg) ** 2;
	return Math.sqrt(acc / (values.length - 1));
}

/** Most frequent value. Ties resolve to the first seen, which keeps fills deterministic. */
export function mode<T extends CellValue>(values: T[]): T | null {
	const counts = new Map<string, { value: T; count: number }>();
	for (const v of values) {
		if (isMissing(v)) continue;
		const key = String(v);
		const hit = counts.get(key);
		if (hit) hit.count++;
		else counts.set(key, { value: v, count: 1 });
	}
	let best: { value: T; count: number } | null = null;
	for (const entry of counts.values()) {
		if (!best || entry.count > best.count) best = entry;
	}
	return best ? best.value : null;
}

/** Pearson correlation on paired values. Returns null when undefined (zero variance). */
export function correlation(xs: number[], ys: number[]): number | null {
	const n = Math.min(xs.length, ys.length);
	if (n < 3) return null;
	const mx = mean(xs);
	const my = mean(ys);
	let num = 0;
	let dx = 0;
	let dy = 0;
	for (let i = 0; i < n; i++) {
		const a = xs[i] - mx;
		const b = ys[i] - my;
		num += a * b;
		dx += a * a;
		dy += b * b;
	}
	if (dx === 0 || dy === 0) return null;
	const r = num / Math.sqrt(dx * dy);
	if (!Number.isFinite(r)) return null;
	return Math.max(-1, Math.min(1, r));
}

/** Slope of a least-squares fit, used for "trending up/down" insights. */
export function linearSlope(values: number[]): number {
	const n = values.length;
	if (n < 2) return 0;
	const mx = (n - 1) / 2;
	const my = mean(values);
	let num = 0;
	let den = 0;
	for (let i = 0; i < n; i++) {
		num += (i - mx) * (values[i] - my);
		den += (i - mx) ** 2;
	}
	return den === 0 ? 0 : num / den;
}

export function summarizeNumeric(values: number[], rowIndices: number[]): NumericSummary {
	const sorted = [...values].sort((a, b) => a - b);
	const sum = values.reduce((a, b) => a + b, 0);
	const avg = values.length ? sum / values.length : 0;
	const q1 = quantileSorted(sorted, 0.25);
	const q3 = quantileSorted(sorted, 0.75);
	const iqr = q3 - q1;
	const lowFence = q1 - 1.5 * iqr;
	const highFence = q3 + 1.5 * iqr;

	const outlierRows: number[] = [];
	let outlierCount = 0;
	if (iqr > 0) {
		for (let i = 0; i < values.length; i++) {
			if (values[i] < lowFence || values[i] > highFence) {
				outlierCount++;
				if (outlierRows.length < MAX_TRACKED_OUTLIERS) outlierRows.push(rowIndices[i]);
			}
		}
	}

	return {
		count: values.length,
		min: sorted.length ? sorted[0] : 0,
		max: sorted.length ? sorted[sorted.length - 1] : 0,
		sum,
		mean: avg,
		median: quantileSorted(sorted, 0.5),
		stdDev: stdDev(values, avg),
		q1,
		q3,
		outlierRows,
		outlierCount
	};
}

export function summarizeCategory(values: CellValue[]): CategorySummary {
	const counts = new Map<string, number>();
	let overflow = false;
	for (const v of values) {
		if (isMissing(v)) continue;
		const key = String(v);
		if (!counts.has(key) && counts.size >= MAX_TRACKED_CATEGORIES) {
			overflow = true;
			continue;
		}
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const top = [...counts.entries()]
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
	return {
		top: top.slice(0, 100),
		distinctCount: overflow ? counts.size + 1 : counts.size
	};
}

/** Pick the bucket a trend chart should use, based on the span of the column. */
export function pickGranularity(min: number, max: number): DateSummary['granularity'] {
	const days = (max - min) / 86400000;
	if (days <= 1) return 'day';
	if (days <= 62) return 'day';
	if (days <= 200) return 'week';
	if (days <= 1100) return 'month';
	if (days <= 4000) return 'quarter';
	return 'year';
}

export function summarizeDate(values: number[]): DateSummary {
	let min = Infinity;
	let max = -Infinity;
	for (const v of values) {
		if (v < min) min = v;
		if (v > max) max = v;
	}
	if (!Number.isFinite(min)) {
		min = 0;
		max = 0;
	}
	return { min, max, granularity: pickGranularity(min, max) };
}

/** Recompute a single column's summary against the current rows. */
export function summarizeColumn(
	column: Pick<Column, 'name' | 'index' | 'type' | 'detectedType' | 'overridden' | 'confidence'>,
	rows: CellValue[][]
): Column {
	const { index, type } = column;
	let missing = 0;
	const distinct = new Set<string>();

	if (type === 'number') {
		const values: number[] = [];
		const rowIndices: number[] = [];
		for (let r = 0; r < rows.length; r++) {
			const v = rows[r][index];
			if (typeof v === 'number' && Number.isFinite(v)) {
				values.push(v);
				rowIndices.push(r);
				if (distinct.size < MAX_TRACKED_CATEGORIES) distinct.add(String(v));
			} else missing++;
		}
		return {
			...column,
			missing,
			distinctCount: distinct.size,
			numeric: summarizeNumeric(values, rowIndices)
		};
	}

	if (type === 'date') {
		const values: number[] = [];
		for (let r = 0; r < rows.length; r++) {
			const v = rows[r][index];
			if (typeof v === 'number' && Number.isFinite(v)) {
				values.push(v);
				if (distinct.size < MAX_TRACKED_CATEGORIES) distinct.add(String(v));
			} else missing++;
		}
		return {
			...column,
			missing,
			distinctCount: distinct.size,
			date: summarizeDate(values)
		};
	}

	const values: CellValue[] = [];
	for (let r = 0; r < rows.length; r++) {
		const v = rows[r][index];
		if (isMissing(v)) missing++;
		else {
			values.push(v);
			if (distinct.size < MAX_TRACKED_CATEGORIES) distinct.add(String(v));
		}
	}
	const category = summarizeCategory(values);
	return { ...column, missing, distinctCount: category.distinctCount, category };
}

let datasetCounter = 0;

export function nextId(prefix: string): string {
	datasetCounter += 1;
	const rand = Math.random().toString(36).slice(2, 8);
	return `${prefix}-${Date.now().toString(36)}-${datasetCounter}-${rand}`;
}

export type BuildDatasetOptions = {
	name: string;
	source: Dataset['source'];
	sheet?: string;
	/** Type overrides keyed by column name, from the preview screen. */
	overrides?: Record<string, ColumnType>;
};

/** RawTable -> fully typed, fully summarised Dataset. */
export function buildDataset(table: RawTable, options: BuildDatasetOptions): Dataset {
	const detected: DetectedColumn[] = detectColumns(table);
	const finalTypes = detected.map((d) => {
		const override = options.overrides?.[d.name];
		return {
			...d,
			finalType: override ?? d.type,
			overridden: !!override && override !== d.type
		};
	});

	// Coerce every cell once, in column order, using each column's resolved type.
	const rows: CellValue[][] = new Array(table.rows.length);
	for (let r = 0; r < table.rows.length; r++) {
		const src = table.rows[r];
		const out: CellValue[] = new Array(finalTypes.length);
		for (let c = 0; c < finalTypes.length; c++) {
			out[c] = coerceValue(src[c] ?? null, finalTypes[c].finalType, finalTypes[c].preferDMY);
		}
		rows[r] = out;
	}

	const columns: Column[] = finalTypes.map((d) =>
		summarizeColumn(
			{
				name: d.name,
				index: d.index,
				type: d.finalType,
				detectedType: d.type,
				overridden: d.overridden,
				confidence: d.confidence
			},
			rows
		)
	);

	return {
		id: nextId('ds'),
		name: options.name,
		source: options.source,
		sheet: options.sheet,
		columns,
		rows,
		rowCount: rows.length,
		skippedEmptyRows: table.skippedEmptyRows,
		createdAt: Date.now()
	};
}

/**
 * Re-type one column in place (preview screen "change type" control) and recompute its
 * summary. The original strings are gone after coercion, so re-typing works from the
 * current representation: dates render back to ISO before being re-read as text, etc.
 */
export function retypeColumn(dataset: Dataset, columnName: string, type: ColumnType): Dataset {
	const col = dataset.columns.find((c) => c.name === columnName);
	if (!col || col.type === type) return dataset;

	const rows = dataset.rows.map((row) => {
		const copy = [...row];
		const current = row[col.index];
		let source: CellValue = current;
		// Dates are stored as epoch ms - restore a readable string before re-reading.
		if (col.type === 'date' && typeof current === 'number') {
			source = new Date(current).toISOString().slice(0, 10);
		}
		if (col.type === 'boolean' && typeof current === 'boolean') {
			source = current ? 'true' : 'false';
		}
		copy[col.index] = coerceValue(source, type, true);
		return copy;
	});

	const columns = dataset.columns.map((c) =>
		c.name === columnName
			? summarizeColumn(
					{
						name: c.name,
						index: c.index,
						type,
						detectedType: c.detectedType,
						overridden: type !== c.detectedType,
						confidence: c.confidence
					},
					rows
				)
			: c
	);

	return { ...dataset, rows, columns };
}

/** Rebuild every column summary after the rows changed (used by cleaning). */
export function resummarize(dataset: Dataset, rows: CellValue[][]): Dataset {
	const columns = dataset.columns.map((c) =>
		summarizeColumn(
			{
				name: c.name,
				index: c.index,
				type: c.type,
				detectedType: c.detectedType,
				overridden: c.overridden,
				confidence: c.confidence
			},
			rows
		)
	);
	return { ...dataset, rows, columns, rowCount: rows.length };
}

/* ----------------------------- column helpers ------------------------------ */

export function columnsOfType(dataset: Dataset, ...types: ColumnType[]): Column[] {
	return dataset.columns.filter((c) => types.includes(c.type));
}

export function findColumn(dataset: Dataset, name: string | null | undefined): Column | undefined {
	if (!name) return undefined;
	return dataset.columns.find((c) => c.name === name);
}

/** Numbers for a column, aligned with the given rows (missing values skipped). */
export function numericValues(rows: CellValue[][], index: number): number[] {
	const out: number[] = [];
	for (const row of rows) {
		const v = row[index];
		if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
	}
	return out;
}

/** Paired numeric values for two columns, skipping rows where either is missing. */
export function pairedValues(
	rows: CellValue[][],
	a: number,
	b: number
): { xs: number[]; ys: number[] } {
	const xs: number[] = [];
	const ys: number[] = [];
	for (const row of rows) {
		const x = row[a];
		const y = row[b];
		if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
			xs.push(x);
			ys.push(y);
		}
	}
	return { xs, ys };
}
