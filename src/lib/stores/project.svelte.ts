/**
 * The working project store (Svelte 5 runes).
 *
 * Holds the one dataset the user is currently working on, its cleaning history, the
 * dashboard layout (charts + KPIs) and the active filters. Derived values - filtered rows,
 * quality report, insights - are `$derived` so a filter change recomputes exactly once and
 * every page reads the same numbers.
 *
 * Deliberately a single store rather than many: a dashboard is one coherent thing, and
 * cross-filtering means almost every piece of state is read by almost every component.
 */

import { browser } from '$app/env';
import type {
	CellValue,
	ChartSpec,
	CleanAction,
	CleanStep,
	ColumnType,
	CrossFilter,
	Dataset,
	Filter,
	FilterState,
	Insight,
	KpiSpec,
	QualityReport,
	SavedDashboard
} from '../types';
import { applyCleanAction, autoClean } from '../analysis/clean';
import { analyzeQuality } from '../analysis/quality';
import { nextId, retypeColumn } from '../analysis/stats';
import { applyFilters, describeFilters } from '../charts/aggregate';
import { suggestCharts } from '../charts/suggest';
import { suggestKpis } from '../charts/kpis';
import { generateInsights } from '../insights/generate';
import { settings } from './settings.svelte';
import { saveDashboard } from './storage';

/** Pipeline stage, used to drive the stepper and route guards. */
export type Stage = 'empty' | 'parsing' | 'preview' | 'dashboard';

class ProjectStore {
	dataset = $state<Dataset | null>(null);
	/** Untouched copy taken at import, so the cleaning screen can show before/after. */
	original = $state<Dataset | null>(null);
	stage = $state<Stage>('empty');
	/** Progress message shown by the skeleton loader while analysing. */
	progress = $state<string>('');
	error = $state<{ message: string; hint: string } | null>(null);
	warnings = $state<string[]>([]);
	truncated = $state(false);

	cleanLog = $state<CleanStep[]>([]);
	charts = $state<ChartSpec[]>([]);
	kpis = $state<KpiSpec[]>([]);
	filterState = $state<FilterState>({ filters: [], crossFilter: null });

	/** Set when the current dashboard came from (or was saved to) My Dashboards. */
	savedId = $state<string | null>(null);
	savedName = $state<string>('');
	/** View-only mode, set by a ?view=1 share link. */
	readOnly = $state(false);

	/** Quality of the data as it stands right now. */
	report = $derived.by<QualityReport | null>(() =>
		this.dataset ? analyzeQuality(this.dataset) : null
	);

	/** Quality of the data as it was imported - the "before" half of the comparison. */
	originalReport = $derived.by<QualityReport | null>(() =>
		this.original ? analyzeQuality(this.original) : null
	);

	/** Rows after global slicers + cross-filter. Every chart and KPI reads this. */
	rows = $derived.by<CellValue[][]>(() =>
		this.dataset ? applyFilters(this.dataset, this.filterState) : []
	);

	insights = $derived.by<Insight[]>(() => {
		if (!this.dataset || !this.report) return [];
		return generateInsights(this.dataset, this.rows, this.report, settings.fmt, this.charts);
	});

	visibleCharts = $derived.by<ChartSpec[]>(() => this.charts.filter((c) => !c.hidden));

	filterSummary = $derived.by<string[]>(() =>
		this.dataset ? describeFilters(this.dataset, this.filterState, settings.fmt) : []
	);

	hasActiveFilters = $derived.by<boolean>(() => this.filterSummary.length > 0);

	/** Rows removed by the current filter selection. */
	filteredOut = $derived.by<number>(() =>
		this.dataset ? this.dataset.rowCount - this.rows.length : 0
	);

	/* ------------------------------ lifecycle ------------------------------ */

	startParsing(message = 'Reading your file…'): void {
		this.stage = 'parsing';
		this.progress = message;
		this.error = null;
	}

	setProgress(message: string): void {
		this.progress = message;
	}

	fail(message: string, hint = ''): void {
		this.error = { message, hint };
		this.stage = this.dataset ? 'preview' : 'empty';
		this.progress = '';
	}

	/** Install a freshly parsed dataset and move to the preview screen. */
	load(dataset: Dataset, options: { warnings?: string[]; truncated?: boolean } = {}): void {
		this.dataset = dataset;
		this.original = dataset;
		this.cleanLog = [];
		this.charts = [];
		this.kpis = [];
		this.filterState = { filters: [], crossFilter: null };
		this.savedId = null;
		this.savedName = dataset.name;
		this.readOnly = false;
		this.warnings = options.warnings ?? [];
		this.truncated = options.truncated ?? false;
		this.error = null;
		this.progress = '';
		this.stage = 'preview';
	}

	reset(): void {
		this.dataset = null;
		this.original = null;
		this.cleanLog = [];
		this.charts = [];
		this.kpis = [];
		this.filterState = { filters: [], crossFilter: null };
		this.savedId = null;
		this.savedName = '';
		this.readOnly = false;
		this.warnings = [];
		this.truncated = false;
		this.error = null;
		this.stage = 'empty';
	}

	/* ------------------------------- cleaning ------------------------------ */

	clean(action: CleanAction): CleanStep | null {
		if (!this.dataset) return null;
		const result = applyCleanAction(this.dataset, action);
		this.dataset = result.dataset;
		// Only log steps that actually changed something, so the log stays honest.
		if (result.step.rowsRemoved > 0 || result.step.cellsChanged > 0) {
			this.cleanLog = [...this.cleanLog, result.step];
		}
		// Filter bounds may no longer be valid after rows change.
		this.#reconcileFilters();
		return result.step;
	}

	cleanAll(): CleanStep[] {
		if (!this.dataset) return [];
		const { dataset, steps } = autoClean(this.dataset);
		this.dataset = dataset;
		this.cleanLog = [...this.cleanLog, ...steps];
		this.#reconcileFilters();
		return steps;
	}

	/** Revert to the data exactly as imported. */
	revertCleaning(): void {
		if (!this.original) return;
		this.dataset = this.original;
		this.cleanLog = [];
		this.filterState = { filters: [], crossFilter: null };
	}

	setColumnType(columnName: string, type: ColumnType): void {
		if (!this.dataset) return;
		this.dataset = retypeColumn(this.dataset, columnName, type);
		// A re-typed column invalidates any chart or filter that used it.
		this.charts = this.charts.filter((c) => c.x !== columnName && c.y !== columnName);
		this.filterState = {
			filters: this.filterState.filters.filter((f) => f.column !== columnName),
			crossFilter:
				this.filterState.crossFilter?.column === columnName ? null : this.filterState.crossFilter
		};
	}

	/* ------------------------------ dashboard ------------------------------ */

	/** Build the auto dashboard. Idempotent - safe to call on every mount. */
	buildDashboard(force = false): void {
		if (!this.dataset) return;
		if (!force && this.charts.length > 0) {
			this.stage = 'dashboard';
			return;
		}
		this.charts = suggestCharts(this.dataset);
		this.kpis = suggestKpis(this.dataset);
		this.stage = 'dashboard';
	}

	addChart(spec: ChartSpec): void {
		this.charts = [...this.charts, { span: 6, height: 300, ...spec }];
	}

	updateChart(id: string, patch: Partial<ChartSpec>): void {
		this.charts = this.charts.map((c) => (c.id === id ? { ...c, ...patch } : c));
	}

	removeChart(id: string): void {
		this.charts = this.charts.filter((c) => c.id !== id);
	}

	hideChart(id: string): void {
		this.updateChart(id, { hidden: true });
	}

	restoreChart(id: string): void {
		this.updateChart(id, { hidden: false });
	}

	/** Move a card to a new position (drag to rearrange). */
	moveChart(fromId: string, toId: string): void {
		const from = this.charts.findIndex((c) => c.id === fromId);
		const to = this.charts.findIndex((c) => c.id === toId);
		if (from === -1 || to === -1 || from === to) return;
		const next = [...this.charts];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		this.charts = next;
	}

	resizeChart(id: string, span: number, height?: number): void {
		this.updateChart(id, {
			span: Math.max(3, Math.min(12, span)),
			...(height !== undefined ? { height: Math.max(200, Math.min(700, height)) } : {})
		});
	}

	addKpi(spec: KpiSpec): void {
		this.kpis = [...this.kpis, spec];
	}

	removeKpi(id: string): void {
		this.kpis = this.kpis.filter((k) => k.id !== id);
	}

	/* -------------------------------- filters ------------------------------ */

	setFilter(filter: Filter): void {
		const rest = this.filterState.filters.filter((f) => f.column !== filter.column);
		this.filterState = { ...this.filterState, filters: [...rest, filter] };
	}

	clearFilter(column: string): void {
		this.filterState = {
			...this.filterState,
			filters: this.filterState.filters.filter((f) => f.column !== column)
		};
	}

	clearAllFilters(): void {
		this.filterState = { filters: [], crossFilter: null };
	}

	/** Clicking a chart element. Clicking the same element again clears it. */
	setCrossFilter(cross: CrossFilter | null): void {
		const current = this.filterState.crossFilter;
		if (
			cross &&
			current &&
			current.column === cross.column &&
			String(current.value) === String(cross.value)
		) {
			this.filterState = { ...this.filterState, crossFilter: null };
			return;
		}
		this.filterState = { ...this.filterState, crossFilter: cross };
	}

	getFilter(column: string): Filter | undefined {
		return this.filterState.filters.find((f) => f.column === column);
	}

	/** After cleaning changes the data, drop filters whose bounds no longer apply. */
	#reconcileFilters(): void {
		if (!this.dataset) return;
		const names = new Set(this.dataset.columns.map((c) => c.name));
		this.filterState = {
			filters: this.filterState.filters.filter((f) => names.has(f.column)),
			crossFilter:
				this.filterState.crossFilter && names.has(this.filterState.crossFilter.column)
					? this.filterState.crossFilter
					: null
		};
	}

	/* --------------------------------- save -------------------------------- */

	/**
	 * Persist the current dashboard. The cleaned dataset goes with it so reopening does
	 * not need the original file - which the browser could not keep anyway.
	 */
	save(name: string, thumbnail: string): SavedDashboard {
		if (!this.dataset) throw new Error('There is no dataset to save.');
		const now = Date.now();
		const dashboard: SavedDashboard = {
			id: this.savedId ?? nextId('dash'),
			name: name.trim() || this.dataset.name,
			createdAt: this.savedId ? (this.#createdAt ?? now) : now,
			updatedAt: now,
			datasetName: this.dataset.name,
			rowCount: this.dataset.rowCount,
			columnCount: this.dataset.columns.length,
			thumbnail,
			charts: $state.snapshot(this.charts),
			kpis: $state.snapshot(this.kpis),
			filters: $state.snapshot(this.filterState),
			cleanLog: $state.snapshot(this.cleanLog),
			dataset: $state.snapshot(this.dataset),
			healthScore: this.report?.score ?? 0
		};
		saveDashboard(dashboard);
		this.savedId = dashboard.id;
		this.savedName = dashboard.name;
		this.#createdAt = dashboard.createdAt;
		return dashboard;
	}

	#createdAt: number | null = null;

	/** Reopen a saved dashboard exactly as it was left. */
	restore(dashboard: SavedDashboard, readOnly = false): void {
		this.dataset = dashboard.dataset;
		this.original = dashboard.dataset;
		this.cleanLog = dashboard.cleanLog ?? [];
		this.charts = dashboard.charts ?? [];
		this.kpis = dashboard.kpis ?? [];
		this.filterState = dashboard.filters ?? { filters: [], crossFilter: null };
		this.savedId = dashboard.id;
		this.savedName = dashboard.name;
		this.#createdAt = dashboard.createdAt;
		this.readOnly = readOnly;
		this.warnings = [];
		this.truncated = false;
		this.error = null;
		this.stage = 'dashboard';
	}
}

export const project = new ProjectStore();

/** Guard used by /preview, /dashboard, /story and /builder. */
export function requireDataset(): boolean {
	return browser && project.dataset !== null;
}
