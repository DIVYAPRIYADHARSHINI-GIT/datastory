<script lang="ts">
	/**
	 * A single dashboard card: title, "why this chart" subtitle, the chart itself, and the
	 * per-card toolbar (change type, fullscreen, download PNG, hide, remove, resize).
	 * Drag to rearrange is handled with native HTML5 drag and drop plus a keyboard
	 * alternative (Alt+Arrow), because drag-only reordering is not accessible.
	 */
	import type { ChartSpec } from '#lib/types';
	import { project } from '#lib/stores/project.svelte';
	import { settings } from '#lib/stores/settings.svelte';
	import { buildChartData } from '#lib/charts/aggregate';
	import { buildOption, crossFilterTarget } from '#lib/charts/options';
	import { CHART_TYPE_LABEL, compatibleTypes } from '#lib/charts/suggest';
	import EChart from './EChart.svelte';
	import Icon from '../Icon.svelte';
	import EmptyState from '../ui/EmptyState.svelte';
	import { toast } from '../ui/Toast.svelte';

	let {
		spec,
		onMoveBefore,
		onMoveAfter
	}: {
		spec: ChartSpec;
		onMoveBefore?: () => void;
		onMoveAfter?: () => void;
	} = $props();

	let menuOpen = $state(false);
	let fullscreen = $state(false);
	let chartRef = $state<ReturnType<typeof EChart> | null>(null);
	let dragging = $state(false);

	const dataset = $derived(project.dataset);
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
	const types = $derived(dataset ? compatibleTypes(dataset, spec) : []);
	const isCrossFiltered = $derived(
		!!project.filterState.crossFilter && project.filterState.crossFilter.fromChart === spec.id
	);

	const TYPE_ICON = {
		line: 'line',
		area: 'area',
		bar: 'bar',
		hbar: 'hbar',
		pie: 'pie',
		donut: 'donut',
		histogram: 'histogram',
		scatter: 'scatter',
		heatmap: 'heatmap',
		topn: 'topn',
		kpi: 'chart'
	} as const;

	function handleElementClick(params: { dataIndex: number }) {
		if (!data || project.readOnly) return;
		const target = crossFilterTarget(spec, data, params.dataIndex);
		if (!target) return;
		project.setCrossFilter({
			column: target.column,
			value: target.value as never,
			label: target.label,
			fromChart: spec.id,
			bucket: target.bucket
		});
	}

	function downloadPng() {
		const url = chartRef?.toDataUrl(2, settings.isDark ? '#151b2d' : '#ffffff');
		if (!url) {
			toast.error('Could not export this chart', 'The chart has not finished rendering yet.');
			return;
		}
		const a = document.createElement('a');
		a.href = url;
		a.download = `${spec.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
		a.click();
		toast.success('Chart saved as PNG');
		menuOpen = false;
	}

	function setType(type: ChartSpec['type']) {
		project.updateChart(spec.id, { type });
		menuOpen = false;
	}

	function onDragStart(event: DragEvent) {
		if (project.readOnly) return;
		dragging = true;
		event.dataTransfer?.setData('text/plain', spec.id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		const fromId = event.dataTransfer?.getData('text/plain');
		if (fromId && fromId !== spec.id) project.moveChart(fromId, spec.id);
	}

	function onCardKeydown(event: KeyboardEvent) {
		if (!event.altKey || project.readOnly) return;
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			onMoveBefore?.();
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			onMoveAfter?.();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			project.resizeChart(spec.id, (spec.span ?? 6) + 3, spec.height);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			project.resizeChart(spec.id, (spec.span ?? 6) - 3, spec.height);
		}
	}

	// Drag the bottom edge to change card height.
	let resizing = $state(false);
	function startResize(event: PointerEvent) {
		if (project.readOnly) return;
		resizing = true;
		const startY = event.clientY;
		const startHeight = spec.height ?? 300;
		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);

		function move(e: PointerEvent) {
			project.resizeChart(spec.id, spec.span ?? 6, startHeight + (e.clientY - startY));
		}
		function up() {
			resizing = false;
			target.releasePointerCapture(event.pointerId);
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		}
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}
</script>

<!--
	Escape must close the options menu as well as fullscreen: the menu renders a full-screen
	transparent backdrop for outside-click dismissal, and leaving it open would let that
	backdrop swallow every later click on the page.
-->
<svelte:window
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		if (menuOpen) menuOpen = false;
		else if (fullscreen) fullscreen = false;
	}}
/>

<!--
	A dashboard card is a draggable, keyboard-movable region, so it legitimately carries
	drag and key handlers. `role="group"` plus the explicit aria-label is the accessible
	equivalent; the svelte a11y rule does not know about `role` on <section>.
-->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
	class="card group relative flex flex-col transition-shadow hover:shadow-[var(--shadow-lift)] {dragging
		? 'opacity-50'
		: ''} {isCrossFiltered ? 'ring-2 ring-accent' : ''}"
	draggable={!project.readOnly}
	ondragstart={onDragStart}
	ondragend={() => (dragging = false)}
	ondragover={(e) => e.preventDefault()}
	ondrop={onDrop}
	onkeydown={onCardKeydown}
	tabindex="-1"
	aria-label={spec.title}
	role="group"
>
	<header class="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2">
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-1.5">
				{#if !project.readOnly}
					<span
						class="cursor-grab text-faint opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
						title="Drag to rearrange · Alt+arrows to move and resize"
					>
						<Icon name="grip" size={14} />
					</span>
				{/if}
				<h3 class="truncate text-[13.5px] font-semibold text-ink" title={spec.title}>
					{spec.title}
				</h3>
			</div>
			{#if spec.reason}
				<p class="mt-0.5 truncate pl-0.5 text-[11.5px] text-muted" title={spec.reason}>
					{spec.reason}
				</p>
			{/if}
		</div>

		<div class="no-print flex shrink-0 items-center gap-0.5">
			{#if isCrossFiltered}
				<button
					onclick={() => project.setCrossFilter(null)}
					class="rounded-md px-1.5 py-1 text-[11px] font-medium text-accent hover:bg-accent-soft"
					title="Clear the filter set by clicking this chart"
				>
					Clear
				</button>
			{/if}
			<button
				onclick={() => (fullscreen = true)}
				class="rounded-md p-1.5 text-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-raised hover:text-ink focus-visible:opacity-100"
				title="Fullscreen"
				aria-label="Open {spec.title} fullscreen"
			>
				<Icon name="expand" size={15} />
			</button>
			<div class="relative">
				<button
					onclick={() => (menuOpen = !menuOpen)}
					class="rounded-md p-1.5 text-muted transition-all hover:bg-raised hover:text-ink {menuOpen
						? 'bg-raised text-ink opacity-100'
						: 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
					aria-label="Chart options"
					aria-expanded={menuOpen}
				>
					<Icon name="menu" size={15} />
				</button>

				{#if menuOpen}
					<button
						class="fixed inset-0 z-10 cursor-default"
						onclick={() => (menuOpen = false)}
						aria-label="Close menu"
						tabindex="-1"
					></button>
					<div
						class="card rise absolute top-full right-0 z-20 mt-1 w-56 overflow-hidden p-1 shadow-[var(--shadow-lift)]"
					>
						{#if types.length > 1}
							<p class="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wide text-faint uppercase">
								Chart type
							</p>
							{#each types as type (type)}
								<button
									onclick={() => setType(type)}
									class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-raised {spec.type ===
									type
										? 'font-semibold text-accent'
										: 'text-body'}"
								>
									<Icon name={TYPE_ICON[type]} size={15} />
									{CHART_TYPE_LABEL[type]}
									{#if spec.type === type}
										<Icon name="check" size={14} class="ml-auto" />
									{/if}
								</button>
							{/each}
							<div class="my-1 h-px bg-line"></div>
						{/if}

						<button
							onclick={downloadPng}
							class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-body transition-colors hover:bg-raised"
						>
							<Icon name="download" size={15} /> Download as PNG
						</button>
						<button
							onclick={() => {
								fullscreen = true;
								menuOpen = false;
							}}
							class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-body transition-colors hover:bg-raised"
						>
							<Icon name="expand" size={15} /> Fullscreen
						</button>
						{#if !project.readOnly}
							<button
								onclick={() => {
									project.hideChart(spec.id);
									menuOpen = false;
									toast.info('Chart hidden', 'Restore it from the "Hidden charts" row below.');
								}}
								class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-body transition-colors hover:bg-raised"
							>
								<Icon name="eye-off" size={15} /> Hide
							</button>
							<div class="my-1 h-px bg-line"></div>
							<button
								onclick={() => {
									project.removeChart(spec.id);
									menuOpen = false;
								}}
								class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-[var(--ds-critical)] transition-colors hover:bg-[var(--ds-critical-soft)]"
							>
								<Icon name="trash" size={15} /> Remove from dashboard
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</header>

	<div class="min-h-0 flex-1 px-2 pb-2">
		{#if !data}
			<div class="skeleton m-2 h-[240px]"></div>
		{:else if data.empty}
			<EmptyState
				compact
				icon="filter"
				title="Nothing to show"
				message={data.emptyReason ?? 'This chart has no data for the current filters.'}
			/>
		{:else if option}
			<EChart
				bind:this={chartRef}
				{option}
				height={spec.height ?? 300}
				onElementClick={handleElementClick}
				ariaLabel="{spec.title}. {spec.reason ?? ''}"
			/>
		{/if}
	</div>

	{#if !project.readOnly}
		<!-- Bottom edge: drag to resize height -->
		<div
			role="separator"
			aria-label="Resize chart height"
			onpointerdown={startResize}
			class="absolute inset-x-8 -bottom-0.5 h-2 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100 {resizing
				? 'opacity-100'
				: ''}"
		>
			<div class="mx-auto h-1 w-10 rounded-full bg-line-strong"></div>
		</div>
	{/if}
</section>

{#if fullscreen && option}
	<div class="fixed inset-0 z-50 flex flex-col bg-canvas p-4 sm:p-6">
		<header class="mb-3 flex items-start justify-between gap-4">
			<div>
				<h2 class="text-lg font-semibold text-ink">{spec.title}</h2>
				{#if spec.reason}<p class="mt-0.5 text-[13px] text-muted">{spec.reason}</p>{/if}
			</div>
			<button
				onclick={() => (fullscreen = false)}
				class="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink hover:bg-raised"
			>
				<Icon name="collapse" size={15} /> Close
				<kbd class="ml-1 rounded border border-line px-1 text-[10px] text-muted">Esc</kbd>
			</button>
		</header>
		<div class="card min-h-0 flex-1 p-3">
			{#if data && !data.empty}
				<EChart {option} height={0} ariaLabel={spec.title} />
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Fullscreen chart fills its flex parent instead of using a fixed pixel height. */
	:global(.fixed > .card > div[role='img']) {
		height: 100% !important;
	}
</style>
