/**
 * Shared vocabulary for DataStory.
 *
 * The whole app is a pipeline of plain data structures:
 *   RawTable -> Dataset (typed columns) -> QualityReport -> CleanPlan -> Dataset
 *   Dataset + FilterState -> rows -> ChartSpec[] (suggested) -> ChartData -> ECharts option
 *   Dataset -> Insight[]
 * Nothing in this file imports Svelte or a browser API, so every stage is unit-testable.
 */

/** Every value we keep after parsing. Dates are stored as epoch ms numbers in `Dataset`. */
export type CellValue = string | number | boolean | null;

/** A freshly parsed sheet, before type detection. */
export type RawTable = {
	headers: string[];
	rows: CellValue[][];
	/** Rows skipped by the parser because they were completely empty. */
	skippedEmptyRows: number;
};

/**
 * Semantic column type.
 * - number   : continuous measure, safe to sum/average
 * - category : low-cardinality text, safe to group by
 * - text     : high-cardinality free text (names, notes, ids)
 * - date     : stored as epoch ms
 * - boolean  : true/false, yes/no, 1/0
 */
export type ColumnType = 'number' | 'category' | 'text' | 'date' | 'boolean';

export type NumericSummary = {
	count: number;
	min: number;
	max: number;
	sum: number;
	mean: number;
	median: number;
	stdDev: number;
	q1: number;
	q3: number;
	/** Tukey fence outlier row indices (capped at 500 for memory safety). */
	outlierRows: number[];
	outlierCount: number;
};

export type CategorySummary = {
	/** Descending by count. */
	top: { value: string; count: number }[];
	distinctCount: number;
};

export type DateSummary = {
	min: number;
	max: number;
	/** Best-guess granularity for trend charts. */
	granularity: 'day' | 'week' | 'month' | 'quarter' | 'year';
};

export type Column = {
	name: string;
	/** Position in the source table - stays stable even if columns are reordered in the UI. */
	index: number;
	type: ColumnType;
	/** Type DataStory detected before any manual override. */
	detectedType: ColumnType;
	/** True when the user changed the type by hand. */
	overridden: boolean;
	missing: number;
	distinctCount: number;
	numeric?: NumericSummary;
	category?: CategorySummary;
	date?: DateSummary;
	/** How confident detection was, 0..1. Shown as a hint in the preview. */
	confidence: number;
};

export type Dataset = {
	id: string;
	name: string;
	source: 'upload' | 'sample';
	/** Sheet name for Excel files. */
	sheet?: string;
	columns: Column[];
	rows: CellValue[][];
	rowCount: number;
	/** Rows the parser dropped because they were blank. */
	skippedEmptyRows: number;
	createdAt: number;
};

export type QualityIssueKind =
	| 'missing'
	| 'duplicate-rows'
	| 'outliers'
	| 'empty-rows'
	| 'untrimmed'
	| 'mixed-dates'
	| 'constant-column'
	| 'empty-column';

export type QualityIssue = {
	kind: QualityIssueKind;
	column?: string;
	count: number;
	/** 0..1 share of affected cells/rows, used for scoring. */
	share: number;
	message: string;
	severity: 'info' | 'warning' | 'critical';
	/** The cleaning action id that resolves this issue, when one exists. */
	fix?: CleanActionId;
};

export type QualityReport = {
	/** 0-100 "analysis health score". */
	score: number;
	grade: 'excellent' | 'good' | 'fair' | 'poor';
	totalCells: number;
	missingCells: number;
	duplicateRows: number[];
	emptyRows: number[];
	untrimmedCells: number;
	outlierCells: number;
	issues: QualityIssue[];
	perColumn: {
		column: string;
		type: ColumnType;
		missing: number;
		missingShare: number;
		distinctCount: number;
		outliers: number;
	}[];
};

export type CleanActionId =
	| 'remove-duplicates'
	| 'drop-empty-rows'
	| 'trim-spaces'
	| 'standardize-dates'
	| 'fill-missing';

export type FillStrategy = 'mean' | 'median' | 'mode' | 'zero' | 'drop-row';

export type CleanAction =
	| { id: 'remove-duplicates' }
	| { id: 'drop-empty-rows' }
	| { id: 'trim-spaces' }
	| { id: 'standardize-dates' }
	| { id: 'fill-missing'; strategy: FillStrategy; columns?: string[] };

export type CleanStep = {
	action: CleanAction;
	label: string;
	rowsRemoved: number;
	cellsChanged: number;
	at: number;
};

export type CleanResult = {
	dataset: Dataset;
	step: CleanStep;
};

/* ---------------------------------- charts --------------------------------- */

export type ChartType =
	| 'line'
	| 'area'
	| 'bar'
	| 'hbar'
	| 'pie'
	| 'donut'
	| 'histogram'
	| 'scatter'
	| 'heatmap'
	| 'topn'
	| 'kpi';

export type Aggregation = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'distinct';

export type ChartSpec = {
	id: string;
	title: string;
	type: ChartType;
	/** Dimension / x axis column name. */
	x: string | null;
	/** Measure / y axis column name. `null` for count-only charts. */
	y: string | null;
	agg: Aggregation;
	/** Optional second dimension (series split) or second measure for scatter. */
	groupBy?: string | null;
	/** Used by top-n and pie to limit slices. */
	limit?: number;
	/** Date bucket for trend charts. */
	bucket?: 'day' | 'week' | 'month' | 'quarter' | 'year';
	/** Histogram bin count. */
	bins?: number;
	/** Index into the chart palette, so colours stay stable when cards are reordered. */
	colorIndex?: number;
	/** Why the suggester proposed this chart - shown as the card subtitle. */
	reason?: string;
	/** Suggestion ranking score; higher is better. */
	score?: number;
	/** Layout: grid column span out of 12, and a row height in px. */
	span?: number;
	height?: number;
	hidden?: boolean;
};

/** Normalised chart data, ready for an ECharts option builder. */
export type ChartData = {
	/** Category / x labels (formatted strings) */
	labels: string[];
	/** One or more series. */
	series: { name: string; values: (number | null)[] }[];
	/** Raw x values for cross-filtering (epoch ms for dates, raw string for categories). */
	keys: CellValue[];
	/** For scatter: paired points. */
	points?: { x: number; y: number; label: string }[];
	/** For heatmap: matrix of correlations. */
	matrix?: { xLabels: string[]; yLabels: string[]; cells: [number, number, number][] };
	/** Total of all values, for share-of-total annotations. */
	total?: number;
	/** Set when the chart could not be built from the current data. */
	empty?: boolean;
	emptyReason?: string;
};

/* ---------------------------------- filters -------------------------------- */

export type DateRangeFilter = { kind: 'date'; column: string; from: number | null; to: number | null };
export type CategoryFilter = { kind: 'category'; column: string; values: string[] };
export type NumberRangeFilter = { kind: 'number'; column: string; min: number; max: number };
export type BooleanFilter = { kind: 'boolean'; column: string; value: boolean | null };

export type Filter = DateRangeFilter | CategoryFilter | NumberRangeFilter | BooleanFilter;

/** A cross-filter created by clicking a chart element. */
export type CrossFilter = {
	column: string;
	value: CellValue;
	label: string;
	fromChart: string;
	/**
	 * For a date axis, the bucket the SOURCE chart was drawn with. Clicking "Mar 2024" must
	 * select the whole month, and only the originating chart knows it was bucketed monthly -
	 * re-deriving it from the column's default granularity silently selects the wrong span.
	 */
	bucket?: 'day' | 'week' | 'month' | 'quarter' | 'year';
};

export type FilterState = {
	filters: Filter[];
	crossFilter: CrossFilter | null;
};

/* ---------------------------------- KPIs ----------------------------------- */

export type KpiStat = 'sum' | 'avg' | 'max' | 'min' | 'count' | 'growth';

export type KpiSpec = {
	id: string;
	label: string;
	column: string | null;
	stat: KpiStat;
	/** Column used to order the sparkline (usually a date column). */
	trendColumn?: string | null;
	format?: 'number' | 'currency' | 'percent' | 'integer';
};

export type KpiValue = {
	spec: KpiSpec;
	value: number | null;
	display: string;
	/** Period-over-period change, where a date column exists. */
	deltaPct?: number | null;
	sparkline: number[];
	hint?: string;
};

/* -------------------------------- insights --------------------------------- */

export type InsightSeverity = 'info' | 'warning' | 'highlight';

export type Insight = {
	id: string;
	title: string;
	detail: string;
	severity: InsightSeverity;
	/** Chart spec id this insight is evidence for, when one exists on the dashboard. */
	chartId?: string;
	/** Spec to create on demand if the supporting chart is not on the dashboard. */
	chart?: ChartSpec;
	/** Sort weight; higher shows first. */
	weight: number;
	/** Grouping for the Story panel. */
	kind: 'composition' | 'trend' | 'correlation' | 'outlier' | 'quality' | 'distribution' | 'summary';
};

/* -------------------------------- settings --------------------------------- */

export type Theme = 'light' | 'dark' | 'system';
export type NumberFormat = 'international' | 'indian' | 'compact';
export type DateFormat = 'dmy' | 'mdy' | 'iso';

export type Settings = {
	theme: Theme;
	palette: PaletteId;
	numberFormat: NumberFormat;
	dateFormat: DateFormat;
	currency: string;
	decimals: number;
	animations: boolean;
};

export type PaletteId = 'signature' | 'ocean' | 'sunset' | 'forest' | 'mono';

/* ------------------------------ saved dashboards ---------------------------- */

export type SavedDashboard = {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	datasetName: string;
	rowCount: number;
	columnCount: number;
	/** Inline SVG thumbnail so the list renders with no extra work. */
	thumbnail: string;
	charts: ChartSpec[];
	kpis: KpiSpec[];
	filters: FilterState;
	/** Cleaning history, kept so the dashboard explains how the data was prepared. */
	cleanLog: CleanStep[];
	/** The cleaned dataset, so a saved dashboard reopens without re-uploading. */
	dataset: Dataset;
	healthScore: number;
};
