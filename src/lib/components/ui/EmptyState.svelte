<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../Icon.svelte';

	/** Friendly empty state - never a bare "no data". Always says what to do next. */
	let {
		icon = 'spark',
		title,
		message,
		compact = false,
		action
	}: {
		icon?: 'spark' | 'chart' | 'filter' | 'table' | 'upload' | 'dashboard' | 'story' | 'alert' | 'search';
		title: string;
		message: string;
		compact?: boolean;
		action?: Snippet;
	} = $props();
</script>

<div
	class="flex flex-col items-center justify-center text-center {compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14'}"
>
	<div
		class="flex items-center justify-center rounded-2xl bg-accent-soft text-accent {compact
			? 'h-10 w-10'
			: 'h-14 w-14'}"
	>
		<Icon name={icon} size={compact ? 20 : 26} />
	</div>
	<h3 class="font-semibold text-ink {compact ? 'text-sm' : 'text-base'}">{title}</h3>
	<p class="max-w-sm text-[13px] leading-relaxed text-muted">{message}</p>
	{#if action}
		<div class="mt-1.5 flex flex-wrap items-center justify-center gap-2">
			{@render action()}
		</div>
	{/if}
</div>
