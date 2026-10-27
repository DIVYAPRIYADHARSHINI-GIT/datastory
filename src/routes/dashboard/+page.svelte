<script lang="ts">
	/**
	 * The auto-generated dashboard: KPI row, global slicers, chart grid.
	 * Cards are laid out on a 12-column grid using each spec's `span`, which is what makes
	 * drag-resize work without a layout library.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { project } from '#lib/stores/project.svelte';
	import { settings } from '#lib/stores/settings.svelte';
	import { ROUTES } from '#lib/nav';
	import { computeKpi } from '#lib/charts/kpis';
	import { describeQuality } from '#lib/analysis/quality';
	import ChartCard from '#lib/components/charts/ChartCard.svelte';
	import KpiCard from '#lib/components/charts/KpiCard.svelte';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';

	onMount(() => {
		if (!project.dataset) {
			void goto(ROUTES.upload);
			return;
		}
		// Idempotent: only builds if this dashboard has no cards yet.
		project.buildDashboard();
	});

	const dataset = $derived(project.dataset);
	const report = $derived(project.report);

	const kpiValues = $derived.by(() => {
		if (!dataset) return [];
		return project.kpis.map((spec) => computeKpi(dataset, project.rows, spec, settings.fmt));
	});

	const hiddenCharts = $derived(project.charts.filter((c) => c.hidden));

	/** Top 3 insights, shown as a teaser strip above the charts. */
	const topInsights = $derived(project.insights.filter((i) => i.kind !== 'summary').slice(0, 3));

	const SEVERITY_TONE = { info: 'neutral', warning: 'caution', highlight: 'accent' } as const;

	function regenerate() {
		project.buildDashboard(true);
		toast.success('Dashboard rebuilt', 'Charts were re-suggested from the current column types.');
	}

	/**
	 * Problems that visibly corrupt a chart, as opposed to merely lowering the score.
	 * Untrimmed text splits one category into two bars; duplicates inflate every total.
	 */
	const cleaningReasons = $derived.by(() => {
		const r = report;
		if (!r) return [];
		const out: string[] = [];
		if (r.untrimmedCells > 0) {
			out.push(
				`${r.untrimmedCells.toLocaleString()} cells have stray spaces, which splits the same category into separate bars.`
			);
		}
		if (r.duplicateRows.length > 0) {
			out.push(
				`${r.duplicateRows.length.toLocaleString()} duplicate rows are inflating every total.`
			);
		}
		return out;
	});

	const needsCleaning = $derived(cleaningReasons.length > 0);

	let cleaning = $state(false);
	async function cleanNow() {
		cleaning = true;
		await new Promise((r) => setTimeout(r, 160));
		const steps = project.cleanAll();
		// Re-suggest: cleaning can change cardinality, which changes the right chart type.
		project.buildDashboard(true);
		cleaning = false;
		toast.success(
			`Cleaned and rebuilt (${steps.length} step${steps.length === 1 ? '' : 's'})`,
			`Health score is now ${project.report?.score ?? 0}/100.`
		);
	}

	function moveCard(id: string, direction: -1 | 1) {
		const list = project.visibleCharts;
		const index = list.findIndex((c) => c.id === id);
		const target = list[index + direction];
		if (target) project.moveChart(id, target.id);
	}

	/** Tailwind cannot generate arbitrary spans at runtime, so map to static classes. */
	const SPAN_CLASS: Record<number, string> = {
		3: 'lg:col-span-3',
		4: 'lg:col-span-4',
		5: 'lg:col-span-5',
		6: 'lg:col-span-6',
		7: 'lg:col-span-7',
		8: 'lg:col-span-8',
		9: 'lg:col-span-9',
		10: 'lg:col-span-10',
		11: 'lg:col-span-11',
		12: 'lg:col-span-12'
	};
</script>

<svelte:head><title>Dashboard · DataStory</title></svelte:head>

{#if dataset && report}
	<div class="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
		<!-- ------------------------------- header ------------------------------- -->
		<header class="mb-4 flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-2">
					<h1 class="truncate text-[22px] font-semibold tracking-tight text-ink">
						{project.savedName || dataset.name}
					</h1>
					<Badge tone={report.score >= 75 ? 'positive' : report.score >= 55 ? 'caution' : 'critical'}>
						Health {report.score}/100
					</Badge>
					{#if project.cleanLog.length > 0}
						<Badge tone="accent">
							{project.cleanLog.length} cleaning step{project.cleanLog.length === 1 ? '' : 's'}
						</Badge>
					{/if}
				</div>
				<p class="mt-1 text-[13px] text-muted">
					{describeQuality(report, dataset.rowCount)} · {dataset.columns.length} columns
				</p>
			</div>

			<!-- `shrink-0` here would stop the row wrapping and push the page 80px wide on a phone. -->
			<div class="no-print flex min-w-0 flex-wrap items-center gap-2">
				{#if !project.readOnly}
					<Button size="sm" onclick={regenerate} title="Re-suggest charts from scratch">
						<Icon name="refresh" size={15} /> Rebuild
					</Button>
					<Button size="sm" href={ROUTES.builder}>
						<Icon name="plus" size={15} /> Add chart
					</Button>
				{/if}
				<Button size="sm" href={ROUTES.story}>
					<Icon name="story" size={15} /> Story
					{#if project.insights.length > 0}
						<span class="ml-0.5 text-[11px] text-muted">({project.insights.length})</span>
					{/if}
				</Button>
				<Button size="sm" variant="primary" href={ROUTES.exportShare}>
					<Icon name="share" size={15} /> Export & share
				</Button>
			</div>
		</header>

		<!--
			Uncleaned-data nudge.

			Untrimmed whitespace splits "North" and " North " into two bars, and duplicates
			inflate every total - so an uncleaned dashboard can look plainly wrong while the
			app says nothing. Rather than silently "fixing" the data behind the user's back,
			say exactly what is off and offer the one-click fix.
		-->
		{#if needsCleaning && !project.readOnly}
			<div
				class="no-print mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--ds-caution)_32%,transparent)] bg-[var(--ds-caution-soft)] px-4 py-3"
			>
				<Icon name="alert" size={17} class="shrink-0 text-[var(--ds-caution)]" />
				<p class="min-w-[220px] flex-1 text-[12.5px] leading-snug text-body">
					<span class="font-semibold text-[var(--ds-caution)]">These charts may be misleading.</span>
					{cleaningReasons.join(' ')}
				</p>
				<Button size="sm" loading={cleaning} onclick={cleanNow}>
					<Icon name="broom" size={14} /> Clean and rebuild
				</Button>
				<Button size="sm" variant="ghost" href={ROUTES.preview}>Review the data</Button>
			</div>
		{/if}

		<!-- ------------------------------ slicers ------------------------------- -->
		<div class="mb-4">
			<FilterBar />
		</div>

		<!-- ------------------------------- KPIs --------------------------------- -->
		{#if kpiValues.length > 0}
			<div
				class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-{Math.min(
					6,
					kpiValues.length
				)}"
				style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))"
			>
				{#each kpiValues as kpi (kpi.spec.id)}
					<KpiCard {kpi} onRemove={() => project.removeKpi(kpi.spec.id)} />
				{/each}
			</div>
		{/if}

		<!-- --------------------------- insight teaser --------------------------- -->
		{#if topInsights.length > 0}
			<a
				href={ROUTES.story}
				class="card no-print mb-4 block px-4 py-3 transition-colors hover:border-line-strong"
			>
				<div class="mb-2 flex items-center gap-2">
					<Icon name="spark" size={15} class="text-accent" />
					<span class="text-[11px] font-semibold tracking-wide text-faint uppercase">
						What the data says
					</span>
					<span class="ml-auto flex items-center gap-1 text-[12px] font-medium text-accent">
						Read the full story <Icon name="arrow-right" size={13} />
					</span>
				</div>
				<ul class="grid gap-2 md:grid-cols-3">
					{#each topInsights as insight (insight.id)}
						<li class="flex items-start gap-2">
							<Badge size="sm" tone={SEVERITY_TONE[insight.severity]}>{insight.severity}</Badge>
							<span class="text-[12.5px] leading-snug text-body">{insight.title}</span>
						</li>
					{/each}
				</ul>
			</a>
		{/if}

		<!-- ------------------------------ charts -------------------------------- -->
		{#if project.visibleCharts.length === 0}
			<div class="card">
				<EmptyState
					icon="chart"
					title="No charts on this dashboard"
					message="Every card has been removed. Rebuild the automatic dashboard, or create exactly the chart you want in the builder."
				>
					{#snippet action()}
						<Button variant="primary" onclick={regenerate}>
							<Icon name="refresh" size={15} /> Rebuild dashboard
						</Button>
						<Button href={ROUTES.builder}>
							<Icon name="builder" size={15} /> Build a chart
						</Button>
					{/snippet}
				</EmptyState>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-3 lg:grid-cols-12">
				{#each project.visibleCharts as spec, i (spec.id)}
					<div class={SPAN_CLASS[spec.span ?? 6] ?? 'lg:col-span-6'}>
						<ChartCard
							{spec}
							onMoveBefore={() => moveCard(spec.id, -1)}
							onMoveAfter={() => moveCard(spec.id, 1)}
						/>
					</div>
				{/each}
			</div>
		{/if}

		<!-- --------------------------- hidden charts ---------------------------- -->
		{#if hiddenCharts.length > 0 && !project.readOnly}
			<div class="card no-print mt-4 px-4 py-3">
				<p class="mb-2 text-[11px] font-semibold tracking-wide text-faint uppercase">
					Hidden charts ({hiddenCharts.length})
				</p>
				<div class="flex flex-wrap gap-1.5">
					{#each hiddenCharts as spec (spec.id)}
						<button
							onclick={() => project.restoreChart(spec.id)}
							class="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-body transition-colors hover:border-line-strong hover:bg-raised"
						>
							<Icon name="eye" size={13} />
							{spec.title}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- ---------------------------- layout help ----------------------------- -->
		{#if !project.readOnly && project.visibleCharts.length > 0}
			<p class="no-print mt-4 text-center text-[12px] text-faint">
				Drag a card by its handle to rearrange · drag the bottom edge to resize · click any bar, slice
				or point to cross-filter the whole dashboard
			</p>
		{/if}
	</div>
{:else}
	<!-- Skeleton while the guard redirects -->
	<div class="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
		<div class="skeleton mb-4 h-8 w-64"></div>
		<div class="mb-4 grid gap-3 sm:grid-cols-4">
			{#each Array(4) as _, i (i)}
				<div class="skeleton h-24"></div>
			{/each}
		</div>
		<div class="grid gap-3 lg:grid-cols-12">
			<div class="skeleton h-[300px] lg:col-span-8"></div>
			<div class="skeleton h-[300px] lg:col-span-4"></div>
		</div>
	</div>
{/if}
