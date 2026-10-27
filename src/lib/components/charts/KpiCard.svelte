<script lang="ts">
	/**
	 * KPI card: big number, what it measures, a period-over-period delta and a sparkline.
	 * The sparkline is a hand-written SVG rather than an ECharts instance - six of these on
	 * a dashboard would otherwise mean six extra canvases for ~30 points each.
	 */
	import type { KpiValue } from '#lib/types';
	import Icon from '../Icon.svelte';
	import { project } from '#lib/stores/project.svelte';
	import { settings } from '#lib/stores/settings.svelte';

	let { kpi, onRemove }: { kpi: KpiValue; onRemove?: () => void } = $props();

	const delta = $derived(kpi.deltaPct);
	const positive = $derived(delta !== null && delta !== undefined && delta >= 0);

	/** Build an SVG path for the sparkline, normalised to the card's 96x28 box. */
	const sparkPath = $derived.by(() => {
		const values = kpi.sparkline;
		if (values.length < 2) return null;
		// Only the tail matters at this size; 24 points keeps it legible.
		const points = values.slice(-24);
		let min = Infinity;
		let max = -Infinity;
		for (const v of points) {
			if (v < min) min = v;
			if (v > max) max = v;
		}
		const range = max - min || 1;
		const w = 96;
		const h = 28;
		const step = w / (points.length - 1);
		const coords = points.map((v, i) => [i * step, h - ((v - min) / range) * (h - 3) - 1.5]);
		const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
		const area = `${line} L${w},${h} L0,${h} Z`;
		return { line, area };
	});

	const trendColor = $derived(
		positive
			? settings.isDark
				? '#34d399'
				: '#059669'
			: settings.isDark
				? '#fb7185'
				: '#e11d48'
	);
</script>

<div class="card group relative flex flex-col gap-2 px-4 py-3.5">
	<div class="flex items-start justify-between gap-2">
		<p class="truncate text-[11.5px] font-medium tracking-wide text-muted uppercase" title={kpi.spec.label}>
			{kpi.spec.label}
		</p>
		{#if onRemove && !project.readOnly}
			<button
				onclick={onRemove}
				class="no-print -mt-0.5 -mr-1 rounded p-1 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--ds-critical)] focus-visible:opacity-100"
				aria-label="Remove {kpi.spec.label} card"
			>
				<Icon name="x" size={13} />
			</button>
		{/if}
	</div>

	<!--
		The value is the point of the card, so it gets the space: `min-w-0 flex-1` on the text
		and a shrinkable, capped sparkline. A fixed 96px sparkline steals the room that
		"₹31.81M" needs and truncates it to "₹31…" on a six-card row.
	-->
	<div class="flex items-end justify-between gap-2">
		<div class="min-w-0 flex-1">
			<p
				class="truncate text-[clamp(19px,1.7vw,26px)] leading-none font-semibold tracking-tight text-ink"
				title={kpi.display}
			>
				{kpi.display}
			</p>
			{#if kpi.hint}
				<p class="mt-1.5 truncate text-[11px] text-faint">{kpi.hint}</p>
			{/if}
		</div>

		{#if sparkPath}
			<svg
				viewBox="0 0 96 28"
				class="hidden h-7 w-16 max-w-[38%] min-w-0 shrink overflow-visible sm:block"
				aria-hidden="true"
				preserveAspectRatio="none"
			>
				<path d={sparkPath.area} fill={trendColor} fill-opacity="0.14" />
				<path
					d={sparkPath.line}
					fill="none"
					stroke={trendColor}
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
					vector-effect="non-scaling-stroke"
				/>
			</svg>
		{/if}
	</div>

	{#if delta !== null && delta !== undefined && kpi.spec.stat !== 'growth'}
		<div class="flex items-center gap-1 text-[11.5px] font-medium" style="color: {trendColor}">
			<Icon name={positive ? 'arrow-up' : 'arrow-down'} size={13} />
			{Math.abs(delta).toFixed(1)}%
			<span class="font-normal text-faint">vs previous period</span>
		</div>
	{/if}
</div>
