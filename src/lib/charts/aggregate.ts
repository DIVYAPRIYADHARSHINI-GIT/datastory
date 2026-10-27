/**
 * Filtering + aggregation: turns (Dataset, FilterState, ChartSpec) into ChartData.
 *
 * This is the only place that knows how to group rows, so a KPI card, a bar chart and a
 * custom-built chart all agree on what "average revenue by region" means.
 */

import type {
	Aggregation,
	CellValue,
	ChartData,
	ChartSpec,
	Dataset,
	Filter,
	FilterState
} from '../types';
import { correlation, findColumn, pairedValues, quantileSorted } from '../analysis/stats';
import { formatBucket, truncate, type FormatOptions } from '../format';

/** Truncate a UTC timestamp to the start of its bucket. */
export function bucketStart(ms: number, bucket: 'day' | 'week' | 'month' | 'quarter' | 'year'): number {
	const d = new Date(ms);
	switch (bucket) {
		case 'year':
			return Date.UTC(d.getUTCFullYear(), 0, 1);
		case 'quarter':
			return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
		case 'month':
			return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
		case 'week': {
			// ISO week: snap back to Monday.
			const day = (d.getUTCDay() + 6) % 7;
			return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 86400000;
		}
		default:
			return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	}
}

function matchesFilter(row: CellValue[], filter: Filter, index: number): boolean {
	const value = row[index];
	switch (filter.kind) {
		case 'date': {
			if (typeof value !== 'number') return false;
			if (filter.from !== null && value < filter.from) return false;
			if (filter.to !== null && value > filter.to) return false;
			return true;
		}
		case 'category': {
			if (filter.values.length === 0) return true;
			return value !== null && filter.values.includes(String(value));
		}
		case 'number': {
			if (typeof value !== 'number') return false;
			return value >= filter.min && value <= filter.max;
		}
		case 'boolean': {
			if (filter.value === null) return true;
			return value === filter.value;
		}
	}
}

/**
 * Apply global slicers + the active cross-filter.
 * Returns the original array when nothing is filtered, so charts can skip rebuilds.
 */
export function applyFilters(dataset: Dataset, state: FilterState): CellValue[][] {
	const active: { filter: Filter; index: number }[] = [];
	for (const filter of state.filters) {
		const col = findColumn(dataset, filter.column);
		if (!col) continue;
		// A category filter with nothing selected means "all", not "none".
		if (filter.kind === 'category' && filter.values.length === 0) continue;
		if (filter.kind === 'boolean' && filter.value === null) continue;
		if (filter.kind === 'date' && filter.from === null && filter.to === null) continue;
		if (
			filter.kind === 'number' &&
			col.numeric &&
			filter.min <= col.numeric.min &&
			filter.max >= col.numeric.max
		) {
			continue;
		}
		active.push({ filter, index: col.index });
	}

	const cross = state.crossFilter;
	const crossCol = cross ? findColumn(dataset, cross.column) : undefined;

	if (active.length === 0 && !crossCol) return dataset.rows;

	return dataset.rows.filter((row) => {
		for (const { filter, index } of active) {
			if (!matchesFilter(row, filter, index)) return false;
		}
		if (cross && crossCol) {
			const v = row[crossCol.index];
			if (crossCol.type === 'date' && typeof v === 'number' && typeof cross.value === 'number') {
				// A clicked trend point selects its whole bucket, using the bucket the source
				// chart was drawn with (not the column's default granularity).
				const bucket = cross.bucket ?? crossCol.date?.granularity ?? 'month';
				if (bucketStart(v, bucket) !== cross.value) return false;
			} else if (String(v) !== String(cross.value)) {
				return false;
			}
		}
		return true;
	});
}

/** Fold a list of numbers with the requested aggregation. */
export function aggregateValues(values: number[], agg: Aggregation, rowCount: number): number | null {
	switch (agg) {
		case 'count':
			return rowCount;
		case 'distinct':
			return new Set(values).size;
		case 'sum': {
			if (values.length === 0) return null;
			let sum = 0;
			for (const v of values) sum += v;
			return sum;
		}
		case 'avg': {
			if (values.length === 0) return null;
			let sum = 0;
			for (const v of values) sum += v;
			return sum / values.length;
		}
		case 'min':
			return values.length ? Math.min(...values) : null;
		case 'max':
			return values.length ? Math.max(...values) : null;
	}
}

type Group = { key: CellValue; label: string; values: number[]; rowCount: number; distinct: Set<string> };

/** Group rows by a dimension column, bucketing dates. */
function groupRows(
	dataset: Dataset,
	rows: CellValue[][],
	spec: ChartSpec,
	fmt: FormatOptions
): Group[] {
	const xCol = findColumn(dataset, spec.x);
	const yCol = findColumn(dataset, spec.y);
	if (!xCol) return [];

	const bucket = spec.bucket ?? xCol.date?.granularity ?? 'month';
	const groups = new Map<string, Group>();

	for (const row of rows) {
		const raw = row[xCol.index];
		if (raw === null || raw === undefined) continue;

		let key: CellValue;
		let label: string;
		if (xCol.type === 'date') {
			if (typeof raw !== 'number') continue;
			key = bucketStart(raw, bucket);
			label = formatBucket(key as number, bucket, fmt);
		} else if (xCol.type === 'boolean') {
			key = raw;
			label = raw ? 'Yes' : 'No';
		} else {
			key = raw;
			label = String(raw);
		}

		const mapKey = String(key);
		let group = groups.get(mapKey);
		if (!group) {
			group = { key, label, values: [], rowCount: 0, distinct: new Set() };
			groups.set(mapKey, group);
		}
		group.rowCount++;
		if (yCol) {
			const v = row[yCol.index];
			if (typeof v === 'number' && Number.isFinite(v)) group.values.push(v);
			if (v !== null && v !== undefined) group.distinct.add(String(v));
		}
	}

	const list = [...groups.values()];
	// Dates keep chronological order; categories sort by value so the chart reads as a ranking.
	if (xCol.type === 'date') {
		list.sort((a, b) => Number(a.key) - Number(b.key));
	}
	return list;
}

function emptyData(reason: string): ChartData {
	return { labels: [], series: [], keys: [], empty: true, emptyReason: reason };
}

/** Freedman-Diaconis bin count, clamped to something a human can read. */
export function histogramBins(values: number[], requested?: number): number {
	if (requested && requested > 0) return Math.min(60, Math.max(3, Math.round(requested)));
	if (values.length < 10) return Math.max(3, values.length);
	const sorted = [...values].sort((a, b) => a - b);
	const iqr = quantileSorted(sorted, 0.75) - quantileSorted(sorted, 0.25);
	if (iqr === 0) return 10;
	const width = (2 * iqr) / Math.cbrt(values.length);
	const range = sorted[sorted.length - 1] - sorted[0];
	if (width <= 0 || range <= 0) return 10;
	return Math.min(40, Math.max(5, Math.round(range / width)));
}

/** Correlation matrix across every numeric column, for the heatmap. */
export function correlationMatrix(
	dataset: Dataset,
	rows: CellValue[][],
	maxColumns = 10
): ChartData {
	const numeric = dataset.columns.filter((c) => c.type === 'number').slice(0, maxColumns);
	if (numeric.length < 2) {
		return emptyData('A correlation heatmap needs at least two number columns.');
	}
	const labels = numeric.map((c) => truncate(c.name, 18));
	const cells: [number, number, number][] = [];
	for (let i = 0; i < numeric.length; i++) {
		for (let j = 0; j < numeric.length; j++) {
			if (i === j) {
				cells.push([j, i, 1]);
				continue;
			}
			const { xs, ys } = pairedValues(rows, numeric[i].index, numeric[j].index);
			const r = correlation(xs, ys);
			cells.push([j, i, r === null ? 0 : Math.round(r * 100) / 100]);
		}
	}
	return {
		labels,
		series: [],
		keys: numeric.map((c) => c.name),
		matrix: { xLabels: labels, yLabels: labels, cells }
	};
}

/**
 * Build the data for one chart spec against the already-filtered rows.
 * Returns an `empty: true` ChartData with a readable reason instead of throwing, so one
 * bad card never takes down the dashboard.
 */
export function buildChartData(
	dataset: Dataset,
	rows: CellValue[][],
	spec: ChartSpec,
	fmt: FormatOptions
): ChartData {
	if (rows.length === 0) {
		return emptyData('No rows match the current filters.');
	}

	if (spec.type === 'heatmap') {
		return correlationMatrix(dataset, rows);
	}

	if (spec.type === 'scatter') {
		const xCol = findColumn(dataset, spec.x);
		const yCol = findColumn(dataset, spec.y);
		if (!xCol || !yCol || xCol.type !== 'number' || yCol.type !== 'number') {
			return emptyData('A scatter plot needs two number columns.');
		}
		const points: { x: number; y: number; label: string }[] = [];
		// Cap drawn points so a 200k-row file still renders at 60fps; sample evenly.
		const cap = 4000;
		const stride = rows.length > cap ? Math.ceil(rows.length / cap) : 1;
		for (let i = 0; i < rows.length; i += stride) {
			const x = rows[i][xCol.index];
			const y = rows[i][yCol.index];
			if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
				points.push({ x, y, label: '' });
			}
		}
		if (points.length === 0) return emptyData('No rows have both values filled in.');
		return {
			labels: [],
			series: [],
			keys: [],
			points
		};
	}

	if (spec.type === 'histogram') {
		const col = findColumn(dataset, spec.x ?? spec.y);
		if (!col || col.type !== 'number') {
			return emptyData('A histogram needs a number column.');
		}
		const values: number[] = [];
		for (const row of rows) {
			const v = row[col.index];
			if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
		}
		if (values.length === 0) return emptyData('No numbers left after filtering.');
		const bins = histogramBins(values, spec.bins);
		let min = Infinity;
		let max = -Infinity;
		for (const v of values) {
			if (v < min) min = v;
			if (v > max) max = v;
		}
		if (min === max) {
			return {
				labels: [String(min)],
				series: [{ name: col.name, values: [values.length] }],
				keys: [min],
				total: values.length
			};
		}
		const width = (max - min) / bins;
		const counts = new Array<number>(bins).fill(0);
		for (const v of values) {
			const idx = Math.min(bins - 1, Math.floor((v - min) / width));
			counts[idx]++;
		}
		const labels = counts.map((_, i) => {
			const lo = min + i * width;
			const hi = lo + width;
			const digits = Math.abs(width) >= 10 ? 0 : Math.abs(width) >= 1 ? 1 : 2;
			return `${lo.toFixed(digits)}–${hi.toFixed(digits)}`;
		});
		return {
			labels,
			series: [{ name: `${col.name} count`, values: counts }],
			keys: counts.map((_, i) => min + i * width),
			total: values.length
		};
	}

	// --- grouped charts: line, area, bar, hbar, pie, donut, topn ---
	const xCol = findColumn(dataset, spec.x);
	if (!xCol) return emptyData('Pick a column for the X axis.');
	const yCol = findColumn(dataset, spec.y);
	if (spec.agg !== 'count' && spec.agg !== 'distinct' && !yCol) {
		return emptyData('Pick a number column to measure.');
	}

	const groupCol = findColumn(dataset, spec.groupBy);
	// Series split: build one series per group-by value.
	if (groupCol && groupCol.name !== xCol.name && (spec.type === 'line' || spec.type === 'area' || spec.type === 'bar' || spec.type === 'hbar')) {
		const seriesNames = (groupCol.category?.top ?? []).slice(0, 8).map((t) => t.value);
		if (seriesNames.length > 0) {
			const byName = new Map<string, CellValue[][]>();
			for (const name of seriesNames) byName.set(name, []);
			for (const row of rows) {
				const key = String(row[groupCol.index]);
				const bucketRows = byName.get(key);
				if (bucketRows) bucketRows.push(row);
			}
			// Use the unsplit grouping for a consistent axis across every series.
			const axis = groupRows(dataset, rows, spec, fmt);
			const labels = axis.map((g) => g.label);
			const keys = axis.map((g) => g.key);
			const series = seriesNames.map((name) => {
				const sub = groupRows(dataset, byName.get(name) ?? [], spec, fmt);
				const lookup = new Map(sub.map((g) => [String(g.key), g]));
				return {
					name,
					values: keys.map((k) => {
						const g = lookup.get(String(k));
						if (!g) return spec.agg === 'count' ? 0 : null;
						return aggregateValues(g.values, spec.agg, g.rowCount);
					})
				};
			});
			return { labels, keys, series };
		}
	}

	let groups = groupRows(dataset, rows, spec, fmt);
	if (groups.length === 0) return emptyData('No values to group after filtering.');

	let values = groups.map((g) =>
		spec.agg === 'distinct'
			? g.distinct.size
			: aggregateValues(g.values, spec.agg, g.rowCount)
	);

	// Rankings, pies and wide category axes sort descending and keep the top N.
	const ranked = spec.type === 'topn' || spec.type === 'pie' || spec.type === 'donut' || xCol.type !== 'date';
	if (ranked) {
		const paired = groups.map((g, i) => ({ g, v: values[i] }));
		paired.sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
		const limit = spec.limit ?? (spec.type === 'pie' || spec.type === 'donut' ? 8 : spec.type === 'topn' ? 10 : 20);
		if (paired.length > limit) {
			const head = paired.slice(0, limit);
			// Pies roll the tail into "Other" so the share still sums to 100%.
			if (spec.type === 'pie' || spec.type === 'donut') {
				const tail = paired.slice(limit);
				const otherTotal = tail.reduce((sum, p) => sum + (p.v ?? 0), 0);
				if (otherTotal > 0) {
					head.push({
						g: { key: '__other__', label: `Other (${tail.length})`, values: [], rowCount: 0, distinct: new Set() },
						v: otherTotal
					});
				}
			}
			groups = head.map((p) => p.g);
			values = head.map((p) => p.v);
		} else {
			groups = paired.map((p) => p.g);
			values = paired.map((p) => p.v);
		}
	}

	const measureName =
		spec.agg === 'count'
			? 'Rows'
			: spec.agg === 'distinct'
				? `Distinct ${yCol?.name ?? ''}`.trim()
				: `${aggLabel(spec.agg)} of ${yCol?.name ?? ''}`.trim();

	let total = 0;
	for (const v of values) total += v ?? 0;

	return {
		labels: groups.map((g) => g.label),
		keys: groups.map((g) => g.key),
		series: [{ name: measureName, values }],
		total
	};
}

export function aggLabel(agg: Aggregation): string {
	switch (agg) {
		case 'sum':
			return 'Total';
		case 'avg':
			return 'Average';
		case 'count':
			return 'Count';
		case 'min':
			return 'Minimum';
		case 'max':
			return 'Maximum';
		case 'distinct':
			return 'Distinct';
	}
}

/** Describe the active filters in one sentence, for exports and the filter bar. */
export function describeFilters(dataset: Dataset, state: FilterState, fmt: FormatOptions): string[] {
	const out: string[] = [];
	for (const filter of state.filters) {
		const col = findColumn(dataset, filter.column);
		if (!col) continue;
		if (filter.kind === 'category' && filter.values.length > 0) {
			out.push(
				`${col.name}: ${filter.values.length <= 3 ? filter.values.join(', ') : `${filter.values.length} selected`}`
			);
		} else if (filter.kind === 'number' && col.numeric) {
			if (filter.min > col.numeric.min || filter.max < col.numeric.max) {
				out.push(`${col.name}: ${filter.min} to ${filter.max}`);
			}
		} else if (filter.kind === 'date' && (filter.from !== null || filter.to !== null)) {
			const from = filter.from !== null ? formatBucket(filter.from, 'day', fmt) : 'start';
			const to = filter.to !== null ? formatBucket(filter.to, 'day', fmt) : 'now';
			out.push(`${col.name}: ${from} → ${to}`);
		} else if (filter.kind === 'boolean' && filter.value !== null) {
			out.push(`${col.name}: ${filter.value ? 'Yes' : 'No'}`);
		}
	}
	if (state.crossFilter) out.push(`${state.crossFilter.column}: ${state.crossFilter.label}`);
	return out;
}
