<script lang="ts">
	/**
	 * The Story panel: plain-English insights, grouped and tagged by severity.
	 * Each insight either links to the dashboard card that proves it, or offers to add
	 * that chart to the dashboard on the spot.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { project } from '#lib/stores/project.svelte';
	import { settings } from '#lib/stores/settings.svelte';
	import { ROUTES } from '#lib/nav';
	import { insightsToText } from '#lib/insights/generate';
	import type { Insight } from '#lib/types';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';

	onMount(() => {
		if (!project.dataset) void goto(ROUTES.upload);
	});

	const dataset = $derived(project.dataset);

	type Filter = 'all' | 'highlight' | 'warning' | 'info';
	let severityFilter = $state<Filter>('all');

	const KIND_LABEL: Record<Insight['kind'], string> = {
		summary: 'Overview',
		trend: 'Trends over time',
		composition: 'What makes up the total',
		correlation: 'Relationships between columns',
		outlier: 'Unusual values',
		distribution: 'How values are spread',
		quality: 'Data quality'
	};

	const KIND_ICON: Record<Insight['kind'], 'info' | 'line' | 'donut' | 'scatter' | 'alert' | 'histogram' | 'shield'> =
		{
			summary: 'info',
			trend: 'line',
			composition: 'donut',
			correlation: 'scatter',
			outlier: 'alert',
			distribution: 'histogram',
			quality: 'shield'
		};

	const SEVERITY_TONE = { info: 'neutral', warning: 'caution', highlight: 'accent' } as const;

	const filtered = $derived(
		severityFilter === 'all'
			? project.insights
			: project.insights.filter((i) => i.severity === severityFilter)
	);

	/** Group insights by kind, preserving the weight order inside each group. */
	const grouped = $derived.by(() => {
		const map = new Map<Insight['kind'], Insight[]>();
		for (const insight of filtered) {
			const list = map.get(insight.kind);
			if (list) list.push(insight);
			else map.set(insight.kind, [insight]);
		}
		return [...map.entries()];
	});

	const counts = $derived({
		all: project.insights.length,
		highlight: project.insights.filter((i) => i.severity === 'highlight').length,
		warning: project.insights.filter((i) => i.severity === 'warning').length,
		info: project.insights.filter((i) => i.severity === 'info').length
	});

	async function copyInsights() {
		if (!dataset) return;
		const text = insightsToText(dataset, project.insights, project.filterSummary);
		try {
			await navigator.clipboard.writeText(text);
			toast.success(`${project.insights.length} insights copied`, 'Paste them into any document or email.');
		} catch {
			toast.error(
				'Could not reach the clipboard',
				'Your browser blocked clipboard access. Select the text on screen and copy it manually.'
			);
		}
	}

	/** "Show me" - jump to the proving card, adding it to the dashboard if needed. */
	function showEvidence(insight: Insight) {
		if (insight.chartId) {
			void goto(ROUTES.dashboard);
			return;
		}
		if (insight.chart) {
			project.addChart({ ...insight.chart, reason: `Added from the Story: ${insight.title}` });
			toast.success('Chart added to the dashboard');
			void goto(ROUTES.dashboard);
		}
	}
</script>

<svelte:head><title>Story · DataStory</title></svelte:head>

{#if dataset}
	<div class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
		<header class="mb-5 flex flex-wrap items-start justify-between gap-4">
			<div class="min-w-0">
				<h1 class="text-[22px] font-semibold tracking-tight text-ink">The story in your data</h1>
				<p class="mt-1 text-[13.5px] text-muted">
					{project.insights.length} findings from {project.rows.length.toLocaleString()} rows of
					{dataset.name}. Every number below is computed from your file — nothing is guessed.
				</p>
			</div>
			<div class="no-print flex min-w-0 flex-wrap items-center gap-2">
				<Button size="sm" onclick={copyInsights}>
					<Icon name="copy" size={15} /> Copy insights
				</Button>
				<Button size="sm" variant="primary" href={ROUTES.dashboard}>
					<Icon name="dashboard" size={15} /> Dashboard
				</Button>
			</div>
		</header>

		<div class="mb-4">
			<FilterBar />
		</div>

		<!-- severity filter -->
		<div class="no-print mb-4 flex flex-wrap items-center gap-1.5">
			{#each [{ id: 'all' as const, label: 'All findings' }, { id: 'highlight' as const, label: 'Highlights' }, { id: 'warning' as const, label: 'Warnings' }, { id: 'info' as const, label: 'Info' }] as tab (tab.id)}
				<button
					onclick={() => (severityFilter = tab.id)}
					class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors {severityFilter ===
					tab.id
						? 'bg-accent-soft text-accent'
						: 'text-muted hover:bg-raised hover:text-ink'}"
				>
					{tab.label}
					<span class="text-[11px] opacity-70">{counts[tab.id]}</span>
				</button>
			{/each}
		</div>

		{#if filtered.length === 0}
			<div class="card">
				<EmptyState
					icon="story"
					title="No findings at this level"
					message={severityFilter === 'all'
						? 'DataStory could not find anything notable in the filtered rows. Try clearing a filter to widen the data.'
						: `There are no ${severityFilter} findings. Switch to "All findings" to see everything.`}
				>
					{#snippet action()}
						<Button onclick={() => (severityFilter = 'all')}>Show all findings</Button>
					{/snippet}
				</EmptyState>
			</div>
		{:else}
			<div class="space-y-5">
				{#each grouped as [kind, insights] (kind)}
					<section>
						<div class="mb-2 flex items-center gap-2">
							<Icon name={KIND_ICON[kind]} size={15} class="text-muted" />
							<h2 class="text-[11px] font-semibold tracking-wide text-faint uppercase">
								{KIND_LABEL[kind]}
							</h2>
							<span class="text-[11px] text-faint">({insights.length})</span>
						</div>

						<ul class="space-y-2">
							{#each insights as insight (insight.id)}
								<li class="card group px-4 py-3.5">
									<div class="flex items-start gap-3">
										<Badge size="sm" tone={SEVERITY_TONE[insight.severity]}>
											{insight.severity}
										</Badge>
										<div class="min-w-0 flex-1">
											<h3 class="text-[14px] leading-snug font-semibold text-ink">{insight.title}</h3>
											<p class="mt-1 text-[13px] leading-relaxed text-body">{insight.detail}</p>

											{#if insight.chartId || insight.chart}
												<button
													onclick={() => showEvidence(insight)}
													class="no-print mt-2 flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"
												>
													{insight.chartId ? 'See the chart' : 'Add the chart that shows this'}
													<Icon name="arrow-right" size={13} />
												</button>
											{/if}
										</div>
									</div>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{/if}

		<!-- how these are generated -->
		<div class="card mt-6 px-4 py-3.5">
			<div class="flex items-start gap-3">
				<Icon name="info" size={16} class="mt-0.5 shrink-0 text-muted" />
				<p class="text-[12.5px] leading-relaxed text-muted">
					<span class="font-medium text-body">How these are written.</span>
					Insights come from statistics DataStory already computed — period-over-period change,
					share of total, Pearson correlation, Tukey outlier fences, mean-vs-median skew and the
					quality report. There is no language model involved, so every sentence is reproducible
					from your file. Correlations describe how two columns move together; they do not prove
					that one causes the other.
				</p>
			</div>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-5xl space-y-3 px-4 py-6">
		<div class="skeleton h-8 w-72"></div>
		{#each Array(4) as _, i (i)}
			<div class="skeleton h-20"></div>
		{/each}
	</div>
{/if}
