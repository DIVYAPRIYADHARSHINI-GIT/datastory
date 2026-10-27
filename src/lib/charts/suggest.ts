/**
 * Chart suggestion engine.
 *
 * Given a typed Dataset, propose a ranked dashboard. The rules are deliberately explicit
 * and each suggestion carries a `reason` string that the dashboard shows as the card
 * subtitle, so the user can see WHY a chart was chosen rather than trusting a black box.
 *
 * Ranking heuristics (higher score = earlier on the dashboard):
 *   date + measure        -> line/area trend            score 100
 *   category + measure    -> bar comparison             score  85 (best = most "interesting")
 *   category share        -> donut                      score  70
 *   category ranking      -> top-N                      score  65
 *   numeric distribution  -> histogram                  score  55
 *   numeric x numeric     -> scatter (strongest |r|)    score  50 + 40|r|
 *   3+ numerics           -> correlation heatmap        score  45
 *
 * Column fitness:
 *  - A "measure" is a number column that is not an id-like column and has variance.
 *  - A "dimension" is a category/boolean column with 2..40 distinct values. A category with
 *    one value explains nothing; one with 500 values makes an unreadable bar chart.
 */

import type { Column, Dataset, ChartSpec } from '../types';
import { nextId } from '../analysis/stats';

const MAX_DIMENSION_CARDINALITY = 40;
const MAX_SUGGESTIONS = 9;

/**
 * Column-name hints used to pick the single most meaningful measure, in three tiers.
 *
 * Tier 1 is what a dashboard is usually *about* — money and outcome scores. Tier 2 is
 * volume: real measures, but "Revenue over time" beats "Units Sold over time" as the
 * headline chart. Tier 3 is supporting detail that is rarely the point of the report.
 */
const HEADLINE_MEASURE_NAME =
	/(revenue|sales|amount|profit|income|price|cost|spend|salary|turnover|gmv|score|marks|rating)/i;
/**
 * Within the headline tier, the outcome beats the input. A sales dashboard is about
 * revenue; cost and spend are how you got there. Without this, "Cost" can outrank
 * "Revenue" on a tie-break and the whole dashboard ends up titled after the wrong column.
 */
const OUTCOME_MEASURE_NAME = /(revenue|sales|profit|income|turnover|gmv|score|marks|rating)/i;
const INPUT_MEASURE_NAME = /(cost|spend|expense|tax|discount)/i;
/**
 * Top line beats derived line. Profit is an outcome too, but it is computed FROM revenue -
 * "Revenue over time" is the chart a business expects to open on, and it keeps the
 * headline stable even when the revenue column has a few more gaps than profit does.
 */
const TOP_LINE_MEASURE_NAME = /(revenue|sales|turnover|gmv)/i;
/** Names that signal a real nominal grouping rather than a numeric code set. */
const NOMINAL_DIMENSION_NAME =
	/(region|category|channel|segment|type|status|department|team|plan|contract|grade|stream|industry|city|country|state|location|gender|method|tier|group|brand|product|stage|source|result)/i;
const VOLUME_MEASURE_NAME = /(units|quantity|qty|count|hours|seats|visits|orders|total|value)/i;
const SECONDARY_MEASURE_NAME = /(discount|tax|age|percent|rate|ratio|index|days|tenure)/i;
/** Ranking a list of invoice numbers tells nobody anything. */
const IDENTIFIER_NAME = /(^|[\s_-])(id|uuid|guid|ref|reference|sku|code|number|no\.?)([\s_-]|$)/i;

export function isMeasure(col: Column): boolean {
	if (col.type !== 'number' || !col.numeric) return false;
	if (col.numeric.count === 0) return false;
	// Zero variance means every bar would be identical.
	if (col.numeric.min === col.numeric.max) return false;
	return true;
}

export function isDimension(col: Column): boolean {
	if (col.type === 'boolean') return col.distinctCount >= 1;
	if (col.type !== 'category') return false;
	return col.distinctCount >= 2 && col.distinctCount <= MAX_DIMENSION_CARDINALITY;
}

export function isDateColumn(col: Column): boolean {
	return col.type === 'date' && !!col.date && col.date.max > col.date.min;
}

/** How "chartable" a measure is. Named business metrics win over anonymous numbers. */
function measureScore(col: Column, rowCount: number): number {
	let score = 0;
	if (HEADLINE_MEASURE_NAME.test(col.name)) score += 50;
	else if (VOLUME_MEASURE_NAME.test(col.name)) score += 30;
	else if (SECONDARY_MEASURE_NAME.test(col.name)) score += 15;
	// Outcome beats input within the headline tier.
	if (OUTCOME_MEASURE_NAME.test(col.name)) score += 12;
	else if (INPUT_MEASURE_NAME.test(col.name)) score -= 8;
	if (TOP_LINE_MEASURE_NAME.test(col.name)) score += 15;
	// Completeness matters: a column that is 60% blank makes a misleading chart.
	const filled = rowCount ? 1 - col.missing / rowCount : 0;
	score += filled * 30;
	// Prefer real spread over near-constant values.
	if (col.numeric && col.numeric.mean !== 0) {
		const cv = Math.abs(col.numeric.stdDev / col.numeric.mean);
		score += Math.min(20, cv * 20);
	}
	return score;
}

/**
 * How interesting a dimension is for comparison. The sweet spot is 3-12 categories:
 * enough to compare, few enough to label.
 */
function dimensionScore(col: Column, rowCount: number): number {
	let score = 0;
	const n = col.distinctCount;
	if (n >= 3 && n <= 12) score += 30;
	else if (n === 2) score += 18;
	else if (n <= 20) score += 20;
	else score += 8;
	const filled = rowCount ? 1 - col.missing / rowCount : 0;
	score += filled * 20;

	/*
	 * Prefer a genuinely nominal dimension over a numeric code set.
	 *
	 * A small-integer column like Quantity 1-9 or Rating 1-5 is stored as a category so it
	 * CAN be grouped, but "Revenue by Region" is the chart a user wants on the front page;
	 * "Revenue by Quantity" is a secondary cut. Without this, a numeric code set lands in
	 * the 3-12 sweet spot and takes the headline dimension slot.
	 */
	const values = col.category?.top ?? [];
	const numericLooking =
		values.length > 0 && values.every((v) => /^-?\d+(\.\d+)?$/.test(v.value.trim()));
	if (numericLooking) score -= 22;
	if (NOMINAL_DIMENSION_NAME.test(col.name)) score += 14;
	// A dimension where one value dominates makes a strong "top category" story.
	const top = col.category?.top?.[0];
	if (top && rowCount) {
		const share = top.count / rowCount;
		if (share > 0.3 && share < 0.9) score += 10;
	}
	return score;
}

export type ColumnRoles = {
	measures: Column[];
	dimensions: Column[];
	dates: Column[];
	/** Best measure overall, used for the headline KPI and the trend chart. */
	primaryMeasure: Column | null;
	primaryDimension: Column | null;
	primaryDate: Column | null;
};

/** Classify every column into the role it plays on a dashboard, best first. */
export function assignRoles(dataset: Dataset): ColumnRoles {
	const rowCount = dataset.rowCount;
	const measures = dataset.columns
		.filter(isMeasure)
		.sort((a, b) => measureScore(b, rowCount) - measureScore(a, rowCount));
	const dimensions = dataset.columns
		.filter(isDimension)
		.sort((a, b) => dimensionScore(b, rowCount) - dimensionScore(a, rowCount));
	const dates = dataset.columns
		.filter(isDateColumn)
		.sort((a, b) => (b.date!.max - b.date!.min) - (a.date!.max - a.date!.min));

	return {
		measures,
		dimensions,
		dates,
		primaryMeasure: measures[0] ?? null,
		primaryDimension: dimensions[0] ?? null,
		primaryDate: dates[0] ?? null
	};
}

function spec(partial: Omit<ChartSpec, 'id'>): ChartSpec {
	return { id: nextId('chart'), ...partial };
}

/**
 * Suggest a dashboard's worth of charts, best first.
 * `limit` caps the result; the rest stay available via "Add chart".
 */
export function suggestCharts(dataset: Dataset, limit = MAX_SUGGESTIONS): ChartSpec[] {
	const roles = assignRoles(dataset);
	const out: ChartSpec[] = [];
	let colorIndex = 0;
	const nextColor = () => colorIndex++ % 10;

	const { primaryMeasure, primaryDate, primaryDimension } = roles;

	// 1. Trend over time - the single most valuable chart when a date exists.
	if (primaryDate) {
		const bucket = primaryDate.date!.granularity;
		if (primaryMeasure) {
			out.push(
				spec({
					title: `${primaryMeasure.name} over time`,
					type: 'line',
					x: primaryDate.name,
					y: primaryMeasure.name,
					agg: 'sum',
					bucket,
					colorIndex: nextColor(),
					reason: `"${primaryDate.name}" is a date column, so ${primaryMeasure.name} is summed by ${bucket}`,
					score: 100,
					span: 8,
					height: 300
				})
			);
		} else {
			out.push(
				spec({
					title: `Records over time`,
					type: 'area',
					x: primaryDate.name,
					y: null,
					agg: 'count',
					bucket,
					colorIndex: nextColor(),
					reason: `"${primaryDate.name}" is a date column with no measure to pair, so rows are counted by ${bucket}`,
					score: 95,
					span: 8,
					height: 300
				})
			);
		}
	}

	// 2. Share of total - a donut reads better than a pie and pairs with the trend.
	if (primaryDimension && primaryDimension.distinctCount <= 10) {
		out.push(
			spec({
				title: primaryMeasure
					? `${primaryMeasure.name} share by ${primaryDimension.name}`
					: `Share by ${primaryDimension.name}`,
				type: 'donut',
				x: primaryDimension.name,
				y: primaryMeasure?.name ?? null,
				agg: primaryMeasure ? 'sum' : 'count',
				limit: 8,
				colorIndex: nextColor(),
				reason: `"${primaryDimension.name}" has ${primaryDimension.distinctCount} values, few enough to read as shares`,
				score: 70,
				span: 4,
				height: 300
			})
		);
	}

	// 3. Category comparison - one bar chart per useful dimension, best measure.
	for (const dim of roles.dimensions.slice(0, 3)) {
		if (primaryDimension && dim.name === primaryDimension.name && out.some((c) => c.type === 'donut' && c.x === dim.name)) {
			// Still worth a bar chart: the donut shows share, the bar shows magnitude.
		}
		const wide = dim.distinctCount > 12;
		out.push(
			spec({
				title: primaryMeasure
					? `${primaryMeasure.name} by ${dim.name}`
					: `Rows by ${dim.name}`,
				type: wide ? 'hbar' : 'bar',
				x: dim.name,
				y: primaryMeasure?.name ?? null,
				agg: primaryMeasure ? 'sum' : 'count',
				limit: wide ? 12 : 20,
				colorIndex: nextColor(),
				reason: primaryMeasure
					? `Compares ${primaryMeasure.name} across the ${dim.distinctCount} values of "${dim.name}"`
					: `Counts rows across the ${dim.distinctCount} values of "${dim.name}"`,
				score: 85 - roles.dimensions.indexOf(dim) * 6,
				span: 6,
				height: 300
			})
		);
	}

	// 4. Average comparison - sums hide per-unit performance; show the average too.
	//
	// Use a dimension that does NOT already have a total bar chart where one exists, so the
	// dashboard covers more of the data instead of showing the same split four times.
	if (primaryMeasure && primaryDimension && dataset.rowCount > primaryDimension.distinctCount * 2) {
		const charted = new Set(out.filter((c) => c.type === 'bar' || c.type === 'hbar').map((c) => c.x));
		const avgDim = roles.dimensions.find((d) => !charted.has(d.name)) ?? primaryDimension;
		// Long category names need a horizontal axis to stay readable.
		const wide = avgDim.distinctCount > 8;
		out.push(
			spec({
				title: `Average ${primaryMeasure.name} by ${avgDim.name}`,
				type: wide ? 'hbar' : 'bar',
				x: avgDim.name,
				y: primaryMeasure.name,
				agg: 'avg',
				limit: wide ? 10 : 15,
				colorIndex: nextColor(),
				reason: `Totals favour big groups - the average shows per-record performance`,
				score: 60,
				span: 6,
				height: wide ? 320 : 280
			})
		);
	}

	// 5. Top-N ranking from a high-cardinality text/category column (products, names).
	//
	// A one-row-per-value list still ranks usefully ("top 10 products by revenue"), so the
	// only thing to exclude here is an identifier column, where a ranking is meaningless.
	const rankable = dataset.columns.find(
		(c) =>
			(c.type === 'category' || c.type === 'text') &&
			c.distinctCount > MAX_DIMENSION_CARDINALITY &&
			!IDENTIFIER_NAME.test(c.name) &&
			!!c.category
	);
	if (rankable && primaryMeasure) {
		out.push(
			spec({
				title: `Top 10 ${rankable.name} by ${primaryMeasure.name}`,
				type: 'topn',
				x: rankable.name,
				y: primaryMeasure.name,
				agg: 'sum',
				limit: 10,
				colorIndex: nextColor(),
				reason: `"${rankable.name}" has ${rankable.distinctCount} values - too many to chart, so only the top 10 are shown`,
				score: 65,
				span: 6,
				height: 320
			})
		);
	}

	// 6. Distribution of the primary measure.
	if (primaryMeasure) {
		out.push(
			spec({
				title: `Distribution of ${primaryMeasure.name}`,
				type: 'histogram',
				x: primaryMeasure.name,
				y: null,
				agg: 'count',
				colorIndex: nextColor(),
				reason: `Shows how ${primaryMeasure.name} is spread, including any long tail`,
				score: 55,
				span: 6,
				height: 280
			})
		);
	}

	// 7. Strongest numeric relationship -> scatter.
	if (roles.measures.length >= 2) {
		const best = strongestPair(dataset, roles.measures);
		if (best && Math.abs(best.r) >= 0.25) {
			out.push(
				spec({
					title: `${best.a.name} vs ${best.b.name}`,
					type: 'scatter',
					x: best.a.name,
					y: best.b.name,
					agg: 'avg',
					colorIndex: nextColor(),
					reason: `These two columns have the strongest relationship in the data (r = ${best.r.toFixed(2)})`,
					score: 50 + Math.abs(best.r) * 40,
					span: 6,
					height: 300
				})
			);
		}
	}

	// 8. Correlation heatmap once there are enough numeric columns to make it worth a card.
	if (roles.measures.length >= 3) {
		out.push(
			spec({
				title: 'How the numbers relate',
				type: 'heatmap',
				x: null,
				y: null,
				agg: 'avg',
				colorIndex: nextColor(),
				reason: `${roles.measures.length} number columns - the matrix shows every pairwise correlation at once`,
				score: 45,
				span: 6,
				height: 340
			})
		);
	}

	// 9. Second measure trend, when there is a clear runner-up.
	if (primaryDate && roles.measures.length >= 2) {
		const second = roles.measures[1];
		out.push(
			spec({
				title: `${second.name} over time`,
				type: 'area',
				x: primaryDate.name,
				y: second.name,
				agg: 'sum',
				bucket: primaryDate.date!.granularity,
				colorIndex: nextColor(),
				reason: `A second trend line makes it easy to compare ${second.name} against ${primaryMeasure?.name ?? 'the headline measure'}`,
				score: 40,
				span: 6,
				height: 280
			})
		);
	}

	out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
	return out.slice(0, limit);
}

/** Find the numeric pair with the strongest absolute correlation. */
export function strongestPair(
	dataset: Dataset,
	measures: Column[]
): { a: Column; b: Column; r: number } | null {
	// Keep the comparison bounded - O(n^2) over at most 8 columns.
	const pool = measures.slice(0, 8);
	let best: { a: Column; b: Column; r: number } | null = null;
	for (let i = 0; i < pool.length; i++) {
		for (let j = i + 1; j < pool.length; j++) {
			const { xs, ys } = samplePairs(dataset, pool[i].index, pool[j].index);
			const r = pearson(xs, ys);
			if (r === null) continue;
			if (!best || Math.abs(r) > Math.abs(best.r)) best = { a: pool[i], b: pool[j], r };
		}
	}
	return best;
}

/** Sampled pairs so correlation scanning stays fast on huge tables. */
function samplePairs(dataset: Dataset, a: number, b: number): { xs: number[]; ys: number[] } {
	const rows = dataset.rows;
	const cap = 5000;
	const stride = rows.length > cap ? Math.ceil(rows.length / cap) : 1;
	const xs: number[] = [];
	const ys: number[] = [];
	for (let i = 0; i < rows.length; i += stride) {
		const x = rows[i][a];
		const y = rows[i][b];
		if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
			xs.push(x);
			ys.push(y);
		}
	}
	return { xs, ys };
}

function pearson(xs: number[], ys: number[]): number | null {
	const n = Math.min(xs.length, ys.length);
	if (n < 5) return null;
	let sx = 0;
	let sy = 0;
	for (let i = 0; i < n; i++) {
		sx += xs[i];
		sy += ys[i];
	}
	const mx = sx / n;
	const my = sy / n;
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
	return Number.isFinite(r) ? r : null;
}

/** Chart types that make sense for a given spec, used by the "change chart type" menu. */
export function compatibleTypes(dataset: Dataset, spec: ChartSpec): ChartSpec['type'][] {
	const x = dataset.columns.find((c) => c.name === spec.x);
	const y = dataset.columns.find((c) => c.name === spec.y);
	if (spec.type === 'heatmap') return ['heatmap'];
	if (x?.type === 'number' && y?.type === 'number') return ['scatter', 'line', 'bar', 'histogram'];
	if (x?.type === 'number' && !y) return ['histogram', 'bar'];
	if (x?.type === 'date') return ['line', 'area', 'bar'];
	if (x) return ['bar', 'hbar', 'donut', 'pie', 'topn', 'line'];
	return ['bar'];
}

/** Human label for a chart type, shared by the type picker and the builder. */
export const CHART_TYPE_LABEL: Record<ChartSpec['type'], string> = {
	line: 'Line',
	area: 'Area',
	bar: 'Bar',
	hbar: 'Horizontal bar',
	pie: 'Pie',
	donut: 'Donut',
	histogram: 'Histogram',
	scatter: 'Scatter',
	heatmap: 'Correlation heatmap',
	topn: 'Top N ranking',
	kpi: 'KPI'
};
