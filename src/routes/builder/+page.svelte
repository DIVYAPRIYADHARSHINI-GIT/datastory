<script lang="ts">
	/**
	 * Custom chart builder: pick X, Y, aggregation, group-by, chart type and colour, see a
	 * live preview, then add it to the dashboard. The preview uses the same aggregate +
	 * option pipeline as the dashboard, so what you see is exactly what gets added.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { project } from '#lib/stores/project.svelte';
	import { settings } from '#lib/stores/settings.svelte';
	import { ROUTES } from '#lib/nav';
	import type { Aggregation, ChartSpec, ChartType } from '#lib/types';
	import { nextId } from '#lib/analysis/stats';
	import { aggLabel, buildChartData } from '#lib/charts/aggregate';
	import { buildOption } from '#lib/charts/options';
	import { CHART_TYPE_LABEL } from '#lib/charts/suggest';
	import { paletteColors } from '#lib/charts/palette';
	import EChart from '#lib/components/charts/EChart.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';

	onMount(() => {
		if (!project.dataset) {
			void goto(ROUTES.upload);
			return;
		}
		// Seed sensible defaults so the preview is never blank on arrival.
		const ds = project.dataset;
		const firstDim = ds.columns.find((c) => c.type === 'category' || c.type === 'date');
		const firstMeasure = ds.columns.find((c) => c.type === 'number');
		x = firstDim?.name ?? ds.columns[0]?.name ?? '';
		y = firstMeasure?.name ?? '';
		type = firstDim?.type === 'date' ? 'line' : 'bar';
		agg = firstMeasure ? 'sum' : 'count';
		title = suggestedTitle();
	});

	const dataset = $derived(project.dataset);

	let x = $state('');
	let y = $state('');
	let agg = $state<Aggregation>('sum');
	let groupBy = $state('');
	let type = $state<ChartType>('bar');
	let colorIndex = $state(0);
	let limit = $state(10);
	let bins = $state(0);
	let title = $state('');
	let titleEdited = $state(false);

	const CHART_TYPES: { value: ChartType; icon: 'line' | 'area' | 'bar' | 'hbar' | 'donut' | 'pie' | 'histogram' | 'scatter' | 'heatmap' | 'topn' }[] = [
		{ value: 'bar', icon: 'bar' },
		{ value: 'hbar', icon: 'hbar' },
		{ value: 'line', icon: 'line' },
		{ value: 'area', icon: 'area' },
		{ value: 'donut', icon: 'donut' },
		{ value: 'pie', icon: 'pie' },
		{ value: 'topn', icon: 'topn' },
		{ value: 'histogram', icon: 'histogram' },
		{ value: 'scatter', icon: 'scatter' },
		{ value: 'heatmap', icon: 'heatmap' }
	];

	const AGGREGATIONS: Aggregation[] = ['sum', 'avg', 'count', 'min', 'max', 'distinct'];

	// --- option lists derived from the dataset ---
	const xOptions = $derived(
		dataset
			? dataset.columns.map((c) => ({ value: c.name, label: `${c.name}  ·  ${c.type}` }))
			: []
	);
	const yOptions = $derived(
		dataset
			? [
					{ value: '', label: 'None (count rows)' },
					...dataset.columns
						.filter((c) => c.type === 'number')
						.map((c) => ({ value: c.name, label: c.name }))
				]
			: []
	);
	const groupOptions = $derived(
		dataset
			? [
					{ value: '', label: 'No split' },
					...dataset.columns
						.filter((c) => (c.type === 'category' || c.type === 'boolean') && c.distinctCount <= 12)
						.map((c) => ({ value: c.name, label: `${c.name} (${c.distinctCount})` }))
				]
			: []
	);

	/** Scatter needs two number columns; histogram needs one. Guide the X list accordingly. */
	const xColumn = $derived(dataset?.columns.find((c) => c.name === x));
	const needsNumericX = $derived(type === 'scatter' || type === 'histogram');

	function suggestedTitle(): string {
		if (!x) return 'Custom chart';
		if (type === 'heatmap') return 'How the numbers relate';
		if (type === 'histogram') return `Distribution of ${x}`;
		if (type === 'scatter') return y ? `${x} vs ${y}` : `Distribution of ${x}`;
		if (!y) return `Rows by ${x}`;
		const prefix = type === 'topn' ? `Top ${limit} ` : '';
		return `${prefix}${aggLabel(agg)} of ${y} by ${x}`;
	}

	// Keep the title in sync until the user types their own.
	$effect(() => {
		const _ = [x, y, agg, type, limit];
		void _;
		if (!titleEdited) title = suggestedTitle();
	});

	// Count/distinct do not need a measure; everything else does.
	$effect(() => {
		if ((agg === 'count' || agg === 'distinct') && type !== 'scatter') return;
		if (!y && dataset) {
			const measure = dataset.columns.find((c) => c.type === 'number');
			if (measure && agg !== 'count') agg = 'count';
		}
	});

	const spec = $derived<ChartSpec>({
		id: 'preview',
		title: title || suggestedTitle(),
		type,
		x: x || null,
		y: y || null,
		agg,
		groupBy: groupBy || null,
		limit,
		bins: bins > 0 ? bins : undefined,
		colorIndex,
		span: 6,
		height: 320
	});

	const data = $derived(
		dataset ? buildChartData(dataset, project.rows, spec, settings.fmt) : null
	);
	const option = $derived(
		data && !data.empty
			? buildOption(spec, data, {
					dark: settings.isDark,
					palette: settings.current.palette,
					fmt: settings.fmt,
					animations: settings.current.animations
				})
			: null
	);

	const colors = $derived(paletteColors(settings.current.palette, settings.isDark));

	function addToDashboard() {
		if (!data || data.empty) {
			toast.error('This chart has no data', data?.emptyReason ?? 'Adjust the axes and try again.');
			return;
		}
		project.addChart({
			...spec,
			id: nextId('chart'),
			reason: 'Built by hand in the chart builder'
		});
		toast.success('Chart added to the dashboard');
		void goto(ROUTES.dashboard);
	}
</script>

<svelte:head><title>Build a chart · DataStory</title></svelte:head>

{#if dataset}
	<div class="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
		<header class="mb-5">
			<h1 class="text-[22px] font-semibold tracking-tight text-ink">Build your own chart</h1>
			<p class="mt-1 text-[13.5px] text-muted">
				Pick the columns and DataStory does the aggregation. The preview updates as you go and
				respects the dashboard's current filters.
			</p>
		</header>

		<div class="grid gap-4 lg:grid-cols-[340px_1fr]">
			<!-- ------------------------------ controls ----------------------------- -->
			<div class="card space-y-4 p-4">
				<!-- chart type -->
				<div>
					<span class="mb-1.5 block text-[11px] font-medium tracking-wide text-muted uppercase">
						Chart type
					</span>
					<div class="grid grid-cols-5 gap-1.5">
						{#each CHART_TYPES as item (item.value)}
							<button
								onclick={() => (type = item.value)}
								title={CHART_TYPE_LABEL[item.value]}
								aria-label={CHART_TYPE_LABEL[item.value]}
								aria-pressed={type === item.value}
								class="flex aspect-square items-center justify-center rounded-lg border transition-colors {type ===
								item.value
									? 'border-accent bg-accent-soft text-accent'
									: 'border-line text-muted hover:border-line-strong hover:bg-raised hover:text-ink'}"
							>
								<Icon name={item.icon} size={17} />
							</button>
						{/each}
					</div>
					<p class="mt-1.5 text-[11.5px] text-faint">{CHART_TYPE_LABEL[type]}</p>
				</div>

				{#if type !== 'heatmap'}
					<Select
						bind:value={x}
						options={xOptions}
						label={type === 'histogram' ? 'Column to bin' : type === 'scatter' ? 'X axis (number)' : 'X axis / group by'}
					/>

					{#if needsNumericX && xColumn && xColumn.type !== 'number'}
						<p class="-mt-2 flex items-start gap-1.5 text-[11.5px] text-[var(--ds-caution)]">
							<Icon name="alert" size={13} class="mt-px shrink-0" />
							{CHART_TYPE_LABEL[type]} needs a number column here. Pick one, or switch chart type.
						</p>
					{/if}

					{#if type !== 'histogram'}
						<Select
							bind:value={y}
							options={yOptions}
							label={type === 'scatter' ? 'Y axis (number)' : 'Measure'}
						/>
					{/if}

					{#if type !== 'histogram' && type !== 'scatter'}
						<div>
							<span class="mb-1.5 block text-[11px] font-medium tracking-wide text-muted uppercase">
								Aggregation
							</span>
							<div class="flex flex-wrap gap-1">
								{#each AGGREGATIONS as option (option)}
									{@const disabled = !y && option !== 'count'}
									<button
										onclick={() => (agg = option)}
										{disabled}
										class="rounded-md px-2 py-1 text-[12px] font-medium transition-colors {agg === option
											? 'bg-accent text-[var(--ds-accent-ink)]'
											: 'bg-raised text-body hover:bg-line'} disabled:opacity-40"
									>
										{aggLabel(option)}
									</button>
								{/each}
							</div>
							{#if !y}
								<p class="mt-1.5 text-[11.5px] text-faint">
									With no measure selected, DataStory counts the rows in each group.
								</p>
							{/if}
						</div>
					{/if}

					{#if (type === 'line' || type === 'area' || type === 'bar' || type === 'hbar') && groupOptions.length > 1}
						<Select bind:value={groupBy} options={groupOptions} label="Split into series by" />
					{/if}

					{#if type === 'pie' || type === 'donut' || type === 'topn' || type === 'hbar' || type === 'bar'}
						<label class="block">
							<span class="mb-1.5 block text-[11px] font-medium tracking-wide text-muted uppercase">
								Show top {limit}
							</span>
							<input
								type="range"
								min="3"
								max="30"
								bind:value={limit}
								class="w-full accent-[var(--ds-accent)]"
							/>
						</label>
					{/if}

					{#if type === 'histogram'}
						<label class="block">
							<span class="mb-1.5 block text-[11px] font-medium tracking-wide text-muted uppercase">
								Bins — {bins === 0 ? 'automatic' : bins}
							</span>
							<input
								type="range"
								min="0"
								max="40"
								bind:value={bins}
								class="w-full accent-[var(--ds-accent)]"
							/>
							<span class="mt-1 block text-[11.5px] text-faint">
								0 uses the Freedman–Diaconis rule, which picks a width from the data's spread.
							</span>
						</label>
					{/if}
				{:else}
					<p class="rounded-lg bg-raised px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">
						The correlation heatmap uses every number column automatically — there is nothing to
						configure. It shows the Pearson correlation for each pair.
					</p>
				{/if}

				<!-- colour -->
				<div>
					<span class="mb-1.5 block text-[11px] font-medium tracking-wide text-muted uppercase">
						Colour
					</span>
					<div class="flex flex-wrap gap-1.5">
						{#each colors as color, i (color)}
							<button
								onclick={() => (colorIndex = i)}
								aria-label="Colour {i + 1}"
								aria-pressed={colorIndex === i}
								class="h-7 w-7 rounded-md transition-transform hover:scale-110 {colorIndex === i
									? 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--ds-surface)]'
									: ''}"
								style="background: {color}"
							></button>
						{/each}
					</div>
					<p class="mt-1.5 text-[11.5px] text-faint">
						From the {settings.current.palette} palette — change it in Settings.
					</p>
				</div>

				<!-- title -->
				<label class="block">
					<span class="mb-1.5 block text-[11px] font-medium tracking-wide text-muted uppercase">
						Card title
					</span>
					<input
						bind:value={title}
						oninput={() => (titleEdited = true)}
						placeholder={suggestedTitle()}
						class="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint"
					/>
					{#if titleEdited}
						<button
							onclick={() => {
								titleEdited = false;
								title = suggestedTitle();
							}}
							class="mt-1.5 text-[11.5px] font-medium text-accent hover:underline"
						>
							Use the suggested title
						</button>
					{/if}
				</label>

				<div class="flex gap-2 border-t border-line pt-3">
					<Button variant="primary" full onclick={addToDashboard} disabled={!data || data.empty}>
						<Icon name="plus" size={15} /> Add to dashboard
					</Button>
					<Button href={ROUTES.dashboard}>Cancel</Button>
				</div>
			</div>

			<!-- ------------------------------ preview ------------------------------ -->
			<div class="card flex flex-col p-4">
				<div class="mb-3 flex items-center justify-between gap-3">
					<div class="min-w-0">
						<h2 class="truncate text-[14px] font-semibold text-ink">{spec.title}</h2>
						<p class="mt-0.5 text-[12px] text-muted">
							Live preview · {project.rows.length.toLocaleString()} rows
							{#if project.hasActiveFilters}
								<span class="text-accent">(dashboard filters applied)</span>
							{/if}
						</p>
					</div>
					{#if project.hasActiveFilters}
						<button
							onclick={() => project.clearAllFilters()}
							class="shrink-0 text-[12px] font-medium text-accent hover:underline"
						>
							Clear filters
						</button>
					{/if}
				</div>

				<div class="min-h-[320px] flex-1">
					{#if data?.empty}
						<EmptyState
							icon="chart"
							title="Nothing to chart yet"
							message={data.emptyReason ?? 'Pick columns that suit this chart type.'}
						/>
					{:else if option}
						<EChart {option} height={360} ariaLabel="Preview of {spec.title}" />
					{:else}
						<div class="skeleton h-[360px]"></div>
					{/if}
				</div>

				<!-- what the chart will compute, in words -->
				{#if data && !data.empty && type !== 'heatmap'}
					<p class="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
						{#if type === 'histogram'}
							Splits {x} into {data.labels.length} bins and counts how many rows fall in each.
						{:else if type === 'scatter'}
							Plots {data.points?.length.toLocaleString() ?? 0} points of {x} against {y}.
							{#if (data.points?.length ?? 0) >= 4000}
								Sampled evenly to keep the chart responsive.
							{/if}
						{:else}
							Groups the rows by {x} into {data.labels.length} value{data.labels.length === 1 ? '' : 's'}
							{#if y}and takes the {aggLabel(agg).toLowerCase()} of {y}{:else}and counts the rows{/if}.
							{#if data.total}Total: {data.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}.{/if}
						{/if}
					</p>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-[1600px] px-4 py-6">
		<div class="skeleton h-[480px]"></div>
	</div>
{/if}
