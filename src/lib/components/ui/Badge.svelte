<script lang="ts">
	import type { Snippet } from 'svelte';

	type Tone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical';

	let {
		tone = 'neutral',
		size = 'md',
		class: className = '',
		children
	}: { tone?: Tone; size?: 'sm' | 'md'; class?: string; children: Snippet } = $props();

	const tones: Record<Tone, string> = {
		neutral: 'bg-raised text-muted border-line',
		accent: 'bg-accent-soft text-accent border-[color-mix(in_srgb,var(--ds-accent)_24%,transparent)]',
		positive:
			'bg-[var(--ds-positive-soft)] text-[var(--ds-positive)] border-[color-mix(in_srgb,var(--ds-positive)_26%,transparent)]',
		caution:
			'bg-[var(--ds-caution-soft)] text-[var(--ds-caution)] border-[color-mix(in_srgb,var(--ds-caution)_30%,transparent)]',
		critical:
			'bg-[var(--ds-critical-soft)] text-[var(--ds-critical)] border-[color-mix(in_srgb,var(--ds-critical)_28%,transparent)]'
	};
</script>

<span
	class="inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap {tones[
		tone
	]} {size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} {className}"
>
	{@render children()}
</span>
