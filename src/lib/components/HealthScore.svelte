<script lang="ts">
	/** Analysis health score ring, with an optional before/after comparison. */
	import type { QualityReport } from '#lib/types';
	import Icon from './Icon.svelte';

	let {
		report,
		before = null,
		size = 92
	}: { report: QualityReport; before?: QualityReport | null; size?: number } = $props();

	const r = 42;
	const circ = 2 * Math.PI * r;

	const tone = $derived(
		report.score >= 90
			? 'var(--ds-positive)'
			: report.score >= 75
				? 'var(--chart-2)'
				: report.score >= 55
					? 'var(--ds-caution)'
					: 'var(--ds-critical)'
	);

	const GRADE_COPY: Record<QualityReport['grade'], string> = {
		excellent: 'Ready to analyse as-is',
		good: 'Solid — a couple of small fixes available',
		fair: 'Worth cleaning before you trust the totals',
		poor: 'Clean this first — the numbers will mislead otherwise'
	};

	const delta = $derived(before ? report.score - before.score : null);
</script>

<div class="flex items-center gap-4">
	<div class="relative shrink-0" style="width: {size}px; height: {size}px">
		<svg viewBox="0 0 100 100" class="h-full w-full -rotate-90" aria-hidden="true">
			<circle cx="50" cy="50" {r} fill="none" stroke="var(--ds-line)" stroke-width="8" />
			<circle
				cx="50"
				cy="50"
				{r}
				fill="none"
				stroke={tone}
				stroke-width="8"
				stroke-linecap="round"
				stroke-dasharray="{(report.score / 100) * circ} {circ}"
				style="transition: stroke-dasharray 600ms cubic-bezier(.22,1,.36,1)"
			/>
		</svg>
		<div class="absolute inset-0 flex flex-col items-center justify-center">
			<span class="text-[20px] leading-none font-semibold tracking-tight text-ink">{report.score}</span>
			<span class="text-[9px] tracking-wide text-faint uppercase">/ 100</span>
		</div>
	</div>

	<div class="min-w-0">
		<div class="flex items-center gap-2">
			<p class="text-[14px] font-semibold capitalize text-ink">{report.grade}</p>
			{#if delta !== null && delta !== 0}
				<span
					class="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
					style="color: {delta > 0 ? 'var(--ds-positive)' : 'var(--ds-critical)'}; background: {delta >
					0
						? 'var(--ds-positive-soft)'
						: 'var(--ds-critical-soft)'}"
				>
					<Icon name={delta > 0 ? 'arrow-up' : 'arrow-down'} size={11} />
					{Math.abs(delta)} pts
				</span>
			{/if}
		</div>
		<p class="mt-0.5 text-[12.5px] leading-snug text-muted">{GRADE_COPY[report.grade]}</p>
		{#if before && delta !== null}
			<p class="mt-1.5 text-[11.5px] text-faint">
				Was {before.score}/100 on import
			</p>
		{/if}
	</div>
</div>
