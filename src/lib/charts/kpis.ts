/**
 * KPI card generation.
 *
 * suggestKpis() picks which headline numbers matter for a dataset; computeKpi() evaluates
 * one spec against the currently filtered rows, including a sparkline and a period-over-
 * period growth % when a date column exists.
 */

import type {
	CellValue,
	Dataset,
	KpiSpec,
	KpiValue,
	ChartSpec
} from '../types';
import { findColumn, nextId } from '../analysis/stats';
import { assignRoles } from './suggest';
import { bucketStart } from './aggregate';
import {
	formatCurrency,
	formatInteger,
	formatNumber,
	type FormatOptions
} from '../format';

const CURRENCY_NAME = /(revenue|sales|amount|price|cost|profit|salary|income|spend|fee|budget|payment|total)/i;
const PERCENT_NAME = /(percent|pct|%|rate|share|margin|ratio|completion)/i;

function formatFor(name: string): KpiSpec['format'] {
	if (PERCENT_NAME.test(name)) return 'percent';
	if (CURRENCY_NAME.test(name)) return 'currency';
	return 'number';
}

/**
 * Propose up to 6 KPI cards.
 * Always starts with the row count (every dataset has one), then the primary measure's
 * total + average, growth if a date exists, then max/min, then a second measure's total.
 */
export function suggestKpis(dataset: Dataset): KpiSpec[] {
	const roles = assignRoles(dataset);
	const measure = roles.primaryMeasure;
	const date = roles.primaryDate;
	const out: KpiSpec[] = [];

	out.push({
		id: nextId('kpi'),
		label: 'Records',
		column: null,
		stat: 'count',
		trendColumn: date?.name ?? null,
		format: 'integer'
	});

	if (measure) {
		const fmt = formatFor(measure.name);
		out.push({
			id: nextId('kpi'),
			label: `Total ${measure.name}`,
			column: measure.name,
			stat: 'sum',
			trendColumn: date?.name ?? null,
			format: fmt
		});
		out.push({
			id: nextId('kpi'),
			label: `Average ${measure.name}`,
			column: measure.name,
			stat: 'avg',
			trendColumn: date?.name ?? null,
			format: fmt
		});
		if (date) {
			out.push({
				id: nextId('kpi'),
				label: `${measure.name} growth`,
				column: measure.name,
				stat: 'growth',
				trendColumn: date.name,
				format: 'percent'
			});
		}
		out.push({
			id: nextId('kpi'),
			label: `Highest ${measure.name}`,
			column: measure.name,
			stat: 'max',
			trendColumn: date?.name ?? null,
			format: fmt
		});
	}

	const second = roles.measures[1];
	if (second && out.length < 6) {
		out.push({
			id: nextId('kpi'),
			label: `Total ${second.name}`,
			column: second.name,
			stat: 'sum',
			trendColumn: date?.name ?? null,
			format: formatFor(second.name)
		});
	}

	// No measures at all: show how many distinct values the main dimension has.
	if (!measure && roles.primaryDimension) {
		out.push({
			id: nextId('kpi'),
			label: `Distinct ${roles.primaryDimension.name}`,
			column: roles.primaryDimension.name,
			stat: 'count',
			format: 'integer'
		});
	}

	return out.slice(0, 6);
}

/**
 * Bucketed series used for the sparkline and growth comparison.
 *
 * `partialTail` flags a final bucket that the data only covers part of - a file ending on
 * 1 July has one day of July in it. Growth must ignore it, or every such export reports a
 * catastrophic fake collapse. The sparkline keeps it, because the shape is still true.
 */
function trendSeries(
	dataset: Dataset,
	rows: CellValue[][],
	spec: KpiSpec
): { buckets: number[]; values: number[]; partialTail: boolean } {
	const dateCol = findColumn(dataset, spec.trendColumn);
	if (!dateCol || dateCol.type !== 'date') return { buckets: [], values: [], partialTail: false };
	const valueCol = findColumn(dataset, spec.column);
	const bucket = dateCol.date?.granularity ?? 'month';

	const groups = new Map<number, { sum: number; count: number }>();
	let maxTs = -Infinity;
	for (const row of rows) {
		const ts = row[dateCol.index];
		if (typeof ts !== 'number' || !Number.isFinite(ts)) continue;
		if (ts > maxTs) maxTs = ts;
		const key = bucketStart(ts, bucket);
		let g = groups.get(key);
		if (!g) {
			g = { sum: 0, count: 0 };
			groups.set(key, g);
		}
		g.count++;
		if (valueCol) {
			const v = row[valueCol.index];
			if (typeof v === 'number' && Number.isFinite(v)) g.sum += v;
		}
	}

	const keys = [...groups.keys()].sort((a, b) => a - b);
	const values = keys.map((k) => {
		const g = groups.get(k)!;
		if (!valueCol || spec.stat === 'count') return g.count;
		if (spec.stat === 'avg') return g.count ? g.sum / g.count : 0;
		return g.sum;
	});

	return { buckets: keys, values, partialTail: isPartialTail(keys, values, maxTs) };
}

/** True when the final bucket covers far less time, and far less value, than the rest. */
export function isPartialTail(keys: number[], values: number[], maxTs: number): boolean {
	if (keys.length < 4 || !Number.isFinite(maxTs)) return false;
	const last = keys[keys.length - 1];
	const typicalSpan = (keys[keys.length - 2] - keys[0]) / (keys.length - 2);
	if (typicalSpan <= 0) return false;
	const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
	if (median === 0) return false;
	return (maxTs - last) < typicalSpan * 0.4 && Math.abs(values[values.length - 1] / median) < 0.4;
}

export function computeKpi(
	dataset: Dataset,
	rows: CellValue[][],
	spec: KpiSpec,
	fmt: FormatOptions
): KpiValue {
	const col = findColumn(dataset, spec.column);
	const { values: trend, partialTail } = trendSeries(dataset, rows, spec);
	// Growth compares the last two COMPLETE periods; the sparkline still shows the stub.
	const growthSeries = partialTail ? trend.slice(0, -1) : trend;

	// Row count needs no column.
	if (spec.stat === 'count' || !col) {
		const value =
			col && col.type !== 'number'
				? new Set(rows.map((r) => String(r[col.index])).filter((v) => v !== 'null')).size
				: rows.length;
		return {
			spec,
			value,
			display: formatInteger(value, fmt),
			sparkline: trend,
			deltaPct: growthOf(growthSeries),
			hint: col ? `distinct values in ${col.name}` : 'rows after filters'
		};
	}

	const numbers: number[] = [];
	for (const row of rows) {
		const v = row[col.index];
		if (typeof v === 'number' && Number.isFinite(v)) numbers.push(v);
	}

	if (numbers.length === 0) {
		return { spec, value: null, display: '—', sparkline: [], hint: 'no values after filters' };
	}

	let value: number;
	switch (spec.stat) {
		case 'sum':
			value = numbers.reduce((a, b) => a + b, 0);
			break;
		case 'avg':
			value = numbers.reduce((a, b) => a + b, 0) / numbers.length;
			break;
		case 'max':
			value = Math.max(...numbers);
			break;
		case 'min':
			value = Math.min(...numbers);
			break;
		case 'growth': {
			const delta = growthOf(growthSeries);
			return {
				spec,
				value: delta,
				display: delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`,
				deltaPct: delta,
				sparkline: trend,
				hint:
					growthSeries.length < 2
						? 'needs at least two periods of data'
						: partialTail
							? 'last two complete periods (the final one is partial)'
							: 'latest period vs the one before'
			};
		}
		default:
			value = numbers.reduce((a, b) => a + b, 0);
	}

	return {
		spec,
		value,
		display: renderKpi(value, spec.format ?? 'number', fmt),
		deltaPct: spec.stat === 'sum' || spec.stat === 'avg' ? growthOf(growthSeries) : null,
		sparkline: trend,
		hint: hintFor(spec, numbers.length)
	};
}

function hintFor(spec: KpiSpec, n: number): string {
	switch (spec.stat) {
		case 'avg':
			return `mean of ${n.toLocaleString()} values`;
		case 'max':
			return 'largest single value';
		case 'min':
			return 'smallest single value';
		default:
			return `across ${n.toLocaleString()} values`;
	}
}

export function renderKpi(
	value: number | null,
	format: NonNullable<KpiSpec['format']>,
	fmt: FormatOptions
): string {
	if (value === null) return '—';
	switch (format) {
		case 'currency':
			return formatCurrency(value, fmt);
		case 'percent':
			return `${formatNumber(value, fmt)}%`;
		case 'integer':
			return formatInteger(value, fmt);
		default:
			return formatNumber(value, fmt);
	}
}

/** Latest period vs the previous one. Null when there is not enough history. */
export function growthOf(series: number[]): number | null {
	if (series.length < 2) return null;
	const prev = series[series.length - 2];
	const curr = series[series.length - 1];
	if (prev === 0) return curr === 0 ? 0 : null;
	return ((curr - prev) / Math.abs(prev)) * 100;
}

/** The chart a KPI should jump to when clicked. */
export function kpiChart(dataset: Dataset, spec: KpiSpec): ChartSpec | null {
	const date = findColumn(dataset, spec.trendColumn);
	if (!date) return null;
	return {
		id: nextId('chart'),
		title: `${spec.label} over time`,
		type: 'line',
		x: date.name,
		y: spec.column,
		agg: spec.stat === 'avg' ? 'avg' : spec.column ? 'sum' : 'count',
		bucket: date.date?.granularity ?? 'month',
		span: 6,
		height: 300
	};
}
