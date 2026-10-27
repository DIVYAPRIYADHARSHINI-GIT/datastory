/**
 * Insight generation - the "Story" panel.
 *
 * Produces plain-English, specific, checkable sentences from the data. Every insight is
 * derived from a statistic the app already computed, and carries either a `chartId` (a card
 * already on the dashboard that proves it) or a `chart` spec that can be added on demand,
 * so "show me" is always one click away.
 *
 * Rules are grouped by kind:
 *   summary     - what this dataset is
 *   composition - concentration / dominance within a category
 *   trend       - direction, biggest jump, biggest drop, best/worst period
 *   correlation - strong pairwise relationships, with a "not causation" caveat
 *   outlier     - extreme values worth checking
 *   distribution- skew, spread, zero-heavy columns
 *   quality     - missing data, duplicates - because they change how much to trust the rest
 */

import type {
	CellValue,
	Dataset,
	Insight,
	ChartSpec,
	QualityReport
} from '../types';
import {
	correlation,
	findColumn,
	nextId,
	pairedValues
} from '../analysis/stats';
import { assignRoles, strongestPair } from '../charts/suggest';
import { bucketStart } from '../charts/aggregate';
import {
	formatBucket,
	formatNumber,
	type FormatOptions
} from '../format';

const MAX_INSIGHTS = 14;

function pct(n: number, digits = 1): string {
	return `${n.toFixed(digits)}%`;
}

/** Describe a correlation strength the way an analyst would say it out loud. */
export function describeStrength(r: number): string {
	const a = Math.abs(r);
	if (a >= 0.9) return 'almost perfect';
	if (a >= 0.7) return 'strong';
	if (a >= 0.5) return 'moderate';
	if (a >= 0.3) return 'weak but visible';
	return 'very weak';
}

type Ctx = {
	dataset: Dataset;
	rows: CellValue[][];
	fmt: FormatOptions;
	/** Charts already on the dashboard, so insights can link to an existing card. */
	charts: ChartSpec[];
};

/** Find an existing dashboard card that proves an insight about x/y. */
function linkChart(ctx: Ctx, x: string | null, y: string | null, type?: ChartSpec['type']): string | undefined {
	const hit = ctx.charts.find(
		(c) =>
			!c.hidden &&
			(type ? c.type === type : true) &&
			(x ? c.x === x : true) &&
			(y ? c.y === y : true)
	);
	return hit?.id;
}

function insight(partial: Omit<Insight, 'id'>): Insight {
	return { id: nextId('insight'), ...partial };
}

/* ------------------------------- summary ---------------------------------- */

function summaryInsights(ctx: Ctx): Insight[] {
	const { dataset } = ctx;
	const roles = assignRoles(dataset);
	const parts: string[] = [];
	if (roles.dates.length) parts.push(`${roles.dates.length} date`);
	if (roles.measures.length) parts.push(`${roles.measures.length} number`);
	if (roles.dimensions.length) parts.push(`${roles.dimensions.length} category`);
	const textCols = dataset.columns.filter((c) => c.type === 'text').length;
	if (textCols) parts.push(`${textCols} text`);

	let detail = `${dataset.rowCount.toLocaleString()} rows and ${dataset.columns.length} columns`;
	if (parts.length) detail += `, made up of ${parts.join(', ')} column${parts.length === 1 ? '' : 's'}`;
	detail += '.';

	if (roles.primaryDate?.date) {
		const { min, max } = roles.primaryDate.date;
		detail += ` "${roles.primaryDate.name}" spans ${formatBucket(min, 'day', ctx.fmt)} to ${formatBucket(max, 'day', ctx.fmt)}.`;
	}

	return [
		insight({
			title: 'What this dataset covers',
			detail,
			severity: 'info',
			weight: 100,
			kind: 'summary'
		})
	];
}

/* ----------------------------- composition --------------------------------- */

function compositionInsights(ctx: Ctx): Insight[] {
	const { dataset, rows, fmt } = ctx;
	const roles = assignRoles(dataset);
	const out: Insight[] = [];
	const measure = roles.primaryMeasure;

	for (const dim of roles.dimensions.slice(0, 2)) {
		// Total per category against the current rows.
		const totals = new Map<string, number>();
		let grand = 0;
		for (const row of rows) {
			const key = row[dim.index];
			if (key === null || key === undefined) continue;
			const label = dim.type === 'boolean' ? (key ? 'Yes' : 'No') : String(key);
			let value = 1;
			if (measure) {
				const v = row[measure.index];
				if (typeof v !== 'number' || !Number.isFinite(v)) continue;
				value = v;
			}
			totals.set(label, (totals.get(label) ?? 0) + value);
			grand += value;
		}
		if (grand <= 0 || totals.size === 0) continue;

		const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
		const [topLabel, topValue] = ranked[0];
		const share = (topValue / grand) * 100;
		const unit = measure ? measure.name : 'the records';

		out.push(
			insight({
				title: `${topLabel} leads ${dim.name}`,
				detail: measure
					? `${topLabel} accounts for ${pct(share)} of total ${measure.name} (${formatNumber(topValue, fmt)} of ${formatNumber(grand, fmt)}) across ${ranked.length} ${dim.name} values.`
					: `${topLabel} covers ${pct(share)} of all rows (${formatNumber(topValue, fmt)} of ${formatNumber(grand, fmt)}).`,
				severity: share >= 50 ? 'highlight' : 'info',
				chartId: linkChart(ctx, dim.name, measure?.name ?? null),
				chart: {
					id: nextId('chart'),
					title: `${measure ? measure.name : 'Rows'} by ${dim.name}`,
					type: 'bar',
					x: dim.name,
					y: measure?.name ?? null,
					agg: measure ? 'sum' : 'count',
					limit: 15,
					span: 6,
					height: 300
				},
				weight: 90 - roles.dimensions.indexOf(dim) * 5,
				kind: 'composition'
			})
		);

		// Pareto-style concentration: do a few values carry most of the total?
		if (ranked.length >= 4) {
			let acc = 0;
			let count = 0;
			for (const [, v] of ranked) {
				acc += v;
				count++;
				if (acc / grand >= 0.8) break;
			}
			const countShare = (count / ranked.length) * 100;
			if (countShare <= 50) {
				out.push(
					insight({
						title: `${dim.name} is concentrated`,
						detail: `Just ${count} of ${ranked.length} ${dim.name} values (${pct(countShare, 0)}) produce 80% of ${unit}. The remaining ${ranked.length - count} contribute the last 20%.`,
						severity: 'highlight',
						chartId: linkChart(ctx, dim.name, measure?.name ?? null),
						weight: 78,
						kind: 'composition'
					})
				);
			}
		}

		// A bottom performer is actionable when there are enough groups to compare.
		if (ranked.length >= 3 && measure) {
			const [lastLabel, lastValue] = ranked[ranked.length - 1];
			if (lastValue > 0 && topValue / lastValue >= 3) {
				out.push(
					insight({
						title: `${lastLabel} trails the rest of ${dim.name}`,
						detail: `${lastLabel} contributes ${formatNumber(lastValue, fmt)} of ${measure.name}, ${(topValue / lastValue).toFixed(1)}x less than ${topLabel}. It is the weakest of ${ranked.length} ${dim.name} values.`,
						severity: 'warning',
						chartId: linkChart(ctx, dim.name, measure.name),
						weight: 70,
						kind: 'composition'
					})
				);
			}
		}
	}

	return out;
}

/* -------------------------------- trend ------------------------------------ */

function trendInsights(ctx: Ctx): Insight[] {
	const { dataset, rows, fmt } = ctx;
	const roles = assignRoles(dataset);
	const date = roles.primaryDate;
	if (!date?.date) return [];
	const measure = roles.primaryMeasure;
	const bucket = date.date.granularity;
	const out: Insight[] = [];

	const groups = new Map<number, number>();
	for (const row of rows) {
		const ts = row[date.index];
		if (typeof ts !== 'number' || !Number.isFinite(ts)) continue;
		const key = bucketStart(ts, bucket);
		let value = 1;
		if (measure) {
			const v = row[measure.index];
			if (typeof v !== 'number' || !Number.isFinite(v)) continue;
			value = v;
		}
		groups.set(key, (groups.get(key) ?? 0) + value);
	}
	let keys = [...groups.keys()].sort((a, b) => a - b);
	if (keys.length < 3) return out;
	let values = keys.map((k) => groups.get(k)!);

	/*
	 * Drop a partial trailing period before saying anything about change.
	 *
	 * Real exports almost always end mid-period: a file running to 1 Jul has one day of
	 * July in it. Comparing that stub against a full June produces a headline like
	 * "Revenue fell 97% in July", which is false and is exactly the kind of confident
	 * wrong answer this product must not generate. If the last bucket covers far less
	 * calendar time than the ones before it AND its value collapses accordingly, it is
	 * treated as incomplete and excluded from the change analysis.
	 */
	let partialPeriod: number | null = null;
	if (keys.length >= 4) {
		const last = keys[keys.length - 1];
		const prev = keys[keys.length - 2];
		const typicalSpan = (keys[keys.length - 2] - keys[0]) / (keys.length - 2);
		const observedTail = date.date.max - last;
		const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
		const lastValue = values[values.length - 1];
		// Less than 40% of a normal period elapsed, and the value is under 40% of typical.
		if (
			typicalSpan > 0 &&
			observedTail < typicalSpan * 0.4 &&
			median !== 0 &&
			Math.abs(lastValue / median) < 0.4
		) {
			partialPeriod = last;
			keys = keys.slice(0, -1);
			values = values.slice(0, -1);
			void prev;
		}
	}

	const label = measure ? measure.name : 'records';
	const chartId = linkChart(ctx, date.name, measure?.name ?? null);

	if (partialPeriod !== null) {
		out.push(
			insight({
				title: `The last ${bucket} is incomplete`,
				detail: `${formatBucket(partialPeriod, bucket, fmt)} only has data up to ${formatBucket(date.date.max, 'day', fmt)}, so it looks far smaller than a full ${bucket}. It is excluded from the trend findings below, but it is still drawn on the chart.`,
				severity: 'warning',
				chartId,
				weight: 93,
				kind: 'trend'
			})
		);
	}

	// Overall direction: first third vs last third smooths single-period noise.
	const third = Math.max(1, Math.floor(values.length / 3));
	const head = values.slice(0, third).reduce((a, b) => a + b, 0) / third;
	const tail = values.slice(-third).reduce((a, b) => a + b, 0) / third;
	if (head !== 0) {
		const change = ((tail - head) / Math.abs(head)) * 100;
		if (Math.abs(change) >= 10) {
			out.push(
				insight({
					title: change > 0 ? `${label} is trending up` : `${label} is trending down`,
					detail: `Comparing the first and last ${third} ${bucket}${third === 1 ? '' : 's'}, ${label} ${change > 0 ? 'rose' : 'fell'} ${pct(Math.abs(change))} (${formatNumber(head, fmt)} → ${formatNumber(tail, fmt)} per ${bucket}).`,
					severity: change > 0 ? 'highlight' : 'warning',
					chartId,
					weight: 95,
					kind: 'trend'
				})
			);
		} else {
			out.push(
				insight({
					title: `${label} is broadly flat`,
					detail: `Across ${keys.length} ${bucket}s, ${label} changed only ${pct(Math.abs(change))} between the first and last periods - there is no clear trend.`,
					severity: 'info',
					chartId,
					weight: 60,
					kind: 'trend'
				})
			);
		}
	}

	// Sharpest period-over-period move.
	let biggestDrop = { index: -1, change: 0 };
	let biggestJump = { index: -1, change: 0 };
	for (let i = 1; i < values.length; i++) {
		const prev = values[i - 1];
		if (prev === 0) continue;
		const change = ((values[i] - prev) / Math.abs(prev)) * 100;
		if (change < biggestDrop.change) biggestDrop = { index: i, change };
		if (change > biggestJump.change) biggestJump = { index: i, change };
	}
	if (biggestDrop.index > 0 && biggestDrop.change <= -20) {
		const when = formatBucket(keys[biggestDrop.index], bucket, fmt);
		const before = formatBucket(keys[biggestDrop.index - 1], bucket, fmt);
		out.push(
			insight({
				title: `Sharp drop in ${when}`,
				detail: `${label} fell ${pct(Math.abs(biggestDrop.change))} from ${before} (${formatNumber(values[biggestDrop.index - 1], fmt)}) to ${when} (${formatNumber(values[biggestDrop.index], fmt)}) - the biggest single-period fall in the data.`,
				severity: 'warning',
				chartId,
				weight: 92,
				kind: 'trend'
			})
		);
	}
	if (biggestJump.index > 0 && biggestJump.change >= 20) {
		const when = formatBucket(keys[biggestJump.index], bucket, fmt);
		out.push(
			insight({
				title: `${label} spiked in ${when}`,
				detail: `${label} jumped ${pct(biggestJump.change)} to ${formatNumber(values[biggestJump.index], fmt)} in ${when}, the largest single-period rise in the data.`,
				severity: 'highlight',
				chartId,
				weight: 88,
				kind: 'trend'
			})
		);
	}

	// Best and worst period.
	let bestIdx = 0;
	let worstIdx = 0;
	for (let i = 1; i < values.length; i++) {
		if (values[i] > values[bestIdx]) bestIdx = i;
		if (values[i] < values[worstIdx]) worstIdx = i;
	}
	if (bestIdx !== worstIdx) {
		out.push(
			insight({
				title: `${formatBucket(keys[bestIdx], bucket, fmt)} was the strongest ${bucket}`,
				detail: `Peak ${label} was ${formatNumber(values[bestIdx], fmt)} in ${formatBucket(keys[bestIdx], bucket, fmt)}; the weakest was ${formatNumber(values[worstIdx], fmt)} in ${formatBucket(keys[worstIdx], bucket, fmt)}.`,
				severity: 'info',
				chartId,
				weight: 72,
				kind: 'trend'
			})
		);
	}

	// Gaps in the timeline are worth flagging: a missing month looks like a crash.
	if (keys.length >= 4 && (bucket === 'month' || bucket === 'day' || bucket === 'week')) {
		const stepMs = bucket === 'month' ? 28 * 86400000 : bucket === 'week' ? 7 * 86400000 : 86400000;
		let gaps = 0;
		for (let i = 1; i < keys.length; i++) {
			if (keys[i] - keys[i - 1] > stepMs * 1.8) gaps++;
		}
		if (gaps > 0) {
			out.push(
				insight({
					title: `${gaps} gap${gaps === 1 ? '' : 's'} in the timeline`,
					detail: `Some ${bucket}s have no rows at all. A dip in the trend chart may mean missing data rather than a real decline.`,
					severity: 'warning',
					chartId,
					weight: 66,
					kind: 'trend'
				})
			);
		}
	}

	return out;
}

/* ----------------------------- correlation --------------------------------- */

function correlationInsights(ctx: Ctx): Insight[] {
	const { dataset, rows } = ctx;
	const roles = assignRoles(dataset);
	if (roles.measures.length < 2) return [];
	const out: Insight[] = [];

	const best = strongestPair(dataset, roles.measures);
	if (best && Math.abs(best.r) >= 0.3) {
		const direction = best.r > 0 ? 'positive' : 'negative';
		out.push(
			insight({
				title: `${describeStrength(best.r)} ${direction} link: ${best.a.name} and ${best.b.name}`,
				detail:
					best.r > 0
						? `As ${best.a.name} rises, ${best.b.name} tends to rise too (r = ${best.r.toFixed(2)}). Correlation is not causation - something else may drive both.`
						: `As ${best.a.name} rises, ${best.b.name} tends to fall (r = ${best.r.toFixed(2)}). Correlation is not causation - something else may drive both.`,
				severity: 'highlight',
				chartId: linkChart(ctx, best.a.name, best.b.name, 'scatter'),
				chart: {
					id: nextId('chart'),
					title: `${best.a.name} vs ${best.b.name}`,
					type: 'scatter',
					x: best.a.name,
					y: best.b.name,
					agg: 'avg',
					span: 6,
					height: 300
				},
				weight: 86,
				kind: 'correlation'
			})
		);
	}

	// Near-duplicate columns are a data-modelling problem, not an insight about the business.
	for (let i = 0; i < Math.min(roles.measures.length, 6); i++) {
		for (let j = i + 1; j < Math.min(roles.measures.length, 6); j++) {
			const a = roles.measures[i];
			const b = roles.measures[j];
			const { xs, ys } = pairedValues(rows, a.index, b.index);
			const r = correlation(xs, ys);
			if (r !== null && Math.abs(r) >= 0.97) {
				out.push(
					insight({
						title: `"${a.name}" and "${b.name}" say the same thing`,
						detail: `These two columns move together almost exactly (r = ${r.toFixed(3)}). One is probably derived from the other, so charting both adds no new information.`,
						severity: 'warning',
						weight: 64,
						kind: 'correlation'
					})
				);
			}
		}
	}

	return out;
}

/* ------------------------------- outliers ---------------------------------- */

function outlierInsights(ctx: Ctx): Insight[] {
	const { dataset, fmt } = ctx;
	const out: Insight[] = [];
	for (const col of dataset.columns) {
		if (col.type !== 'number' || !col.numeric) continue;
		const { outlierCount, max, min, mean, median: med, stdDev: sd } = col.numeric;
		if (outlierCount > 0) {
			const share = dataset.rowCount ? (outlierCount / dataset.rowCount) * 100 : 0;
			out.push(
				insight({
					title: `${outlierCount} unusual value${outlierCount === 1 ? '' : 's'} in ${col.name}`,
					detail: `${outlierCount} rows (${pct(share)}) fall outside 1.5x the interquartile range. The highest is ${formatNumber(max, fmt)} against a median of ${formatNumber(med, fmt)} - worth checking before trusting the average.`,
					severity: share >= 5 ? 'warning' : 'info',
					chart: {
						id: nextId('chart'),
						title: `Distribution of ${col.name}`,
						type: 'histogram',
						x: col.name,
						y: null,
						agg: 'count',
						span: 6,
						height: 280
					},
					chartId: linkChart(ctx, col.name, null, 'histogram'),
					weight: 80 - out.length * 2,
					kind: 'outlier'
				})
			);
		}
		// Mean dragged far from the median is the classic "averages lie" case.
		if (sd > 0 && med !== 0 && Math.abs(mean - med) / Math.abs(med) > 0.3) {
			out.push(
				insight({
					title: `The average ${col.name} is misleading`,
					detail: `Mean ${formatNumber(mean, fmt)} vs median ${formatNumber(med, fmt)}: the distribution is skewed, so the median is the fairer "typical" value. Range is ${formatNumber(min, fmt)} to ${formatNumber(max, fmt)}.`,
					severity: 'warning',
					chartId: linkChart(ctx, col.name, null, 'histogram'),
					weight: 74,
					kind: 'distribution'
				})
			);
		}
	}
	return out.slice(0, 4);
}

/* ----------------------------- distribution -------------------------------- */

function distributionInsights(ctx: Ctx): Insight[] {
	const { dataset, rows, fmt } = ctx;
	const out: Insight[] = [];
	for (const col of dataset.columns.slice(0, 12)) {
		if (col.type !== 'number' || !col.numeric) continue;
		// Zero-heavy columns distort every average quietly.
		let zeros = 0;
		let negatives = 0;
		let counted = 0;
		for (const row of rows) {
			const v = row[col.index];
			if (typeof v !== 'number' || !Number.isFinite(v)) continue;
			counted++;
			if (v === 0) zeros++;
			if (v < 0) negatives++;
		}
		if (counted > 0 && zeros / counted >= 0.2) {
			out.push(
				insight({
					title: `${pct((zeros / counted) * 100, 0)} of ${col.name} is zero`,
					detail: `${zeros.toLocaleString()} of ${counted.toLocaleString()} rows have ${col.name} = 0. Averages that include them will look lower than the real typical value.`,
					severity: 'warning',
					weight: 68,
					kind: 'distribution'
				})
			);
		}
		if (negatives > 0 && negatives / counted < 0.5) {
			out.push(
				insight({
					title: `${col.name} has ${negatives} negative value${negatives === 1 ? '' : 's'}`,
					detail: `Negative numbers in ${col.name} may be refunds, corrections or data-entry errors. They offset totals, so the sum of ${formatNumber(col.numeric.sum, fmt)} hides some of the gross amount.`,
					severity: 'info',
					weight: 58,
					kind: 'distribution'
				})
			);
		}
	}
	return out.slice(0, 3);
}

/* -------------------------------- quality ---------------------------------- */

function qualityInsights(ctx: Ctx, report: QualityReport): Insight[] {
	const out: Insight[] = [];
	const rowCount = ctx.dataset.rowCount;

	for (const col of ctx.dataset.columns) {
		if (col.missing === 0 || rowCount === 0) continue;
		const share = (col.missing / rowCount) * 100;
		if (share < 5) continue;
		out.push(
			insight({
				title: `${pct(share, 0)} missing values in ${col.name}`,
				detail: `${col.missing.toLocaleString()} of ${rowCount.toLocaleString()} rows have no ${col.name}. Charts using this column are based on the remaining ${(rowCount - col.missing).toLocaleString()} rows only.`,
				severity: share >= 25 ? 'warning' : 'info',
				weight: 85 - out.length,
				kind: 'quality'
			})
		);
	}

	if (report.duplicateRows.length > 0) {
		const share = rowCount ? (report.duplicateRows.length / rowCount) * 100 : 0;
		out.push(
			insight({
				title: `${report.duplicateRows.length} duplicate rows found`,
				detail: `${pct(share)} of the table is an exact copy of another row. Totals are inflated until they are removed - use "Remove duplicates" on the cleaning screen.`,
				severity: 'warning',
				weight: 82,
				kind: 'quality'
			})
		);
	}

	if (report.score >= 90) {
		out.push(
			insight({
				title: 'This data is in good shape',
				detail: `Health score ${report.score}/100 - very little missing data, no significant duplication, and consistent column types. The numbers below can be read at face value.`,
				severity: 'info',
				weight: 50,
				kind: 'quality'
			})
		);
	}

	return out.slice(0, 5);
}

/* ------------------------------ entry point -------------------------------- */

export function generateInsights(
	dataset: Dataset,
	rows: CellValue[][],
	report: QualityReport,
	fmt: FormatOptions,
	charts: ChartSpec[] = []
): Insight[] {
	const ctx: Ctx = { dataset, rows, fmt, charts };
	if (rows.length === 0) {
		return [
			insight({
				title: 'No rows match the current filters',
				detail: 'Clear or widen a filter to see insights again.',
				severity: 'warning',
				weight: 100,
				kind: 'summary'
			})
		];
	}

	const all = [
		...summaryInsights(ctx),
		...trendInsights(ctx),
		...compositionInsights(ctx),
		...correlationInsights(ctx),
		...outlierInsights(ctx),
		...distributionInsights(ctx),
		...qualityInsights(ctx, report)
	];

	// Deduplicate by title so two rules never say the same thing twice.
	const seen = new Set<string>();
	const unique = all.filter((i) => {
		const key = i.title.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	unique.sort((a, b) => b.weight - a.weight);
	return unique.slice(0, MAX_INSIGHTS);
}

/** Markdown-ish plain text for the "Copy insights" button. */
export function insightsToText(
	dataset: Dataset,
	insights: Insight[],
	filters: string[]
): string {
	const lines: string[] = [];
	lines.push(`DataStory insights - ${dataset.name}`);
	lines.push(`${dataset.rowCount.toLocaleString()} rows x ${dataset.columns.length} columns`);
	if (filters.length) lines.push(`Filters: ${filters.join(' | ')}`);
	lines.push('');
	const tag = { info: 'INFO', warning: 'WARNING', highlight: 'HIGHLIGHT' } as const;
	for (const i of insights) {
		lines.push(`[${tag[i.severity]}] ${i.title}`);
		lines.push(`  ${i.detail}`);
		lines.push('');
	}
	lines.push('Generated by DataStory - all analysis ran in the browser.');
	return lines.join('\n');
}
