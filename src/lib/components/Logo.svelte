<script lang="ts">
	/** DataStory wordmark: three rising bars that double as a "story" page edge. */
	let { size = 28, withText = true }: { size?: number; withText?: boolean } = $props();
</script>

<span class="inline-flex items-center gap-2">
	<svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
		<rect width="32" height="32" rx="8" fill="var(--ds-accent)" />
		<rect x="7" y="17" width="4" height="8" rx="1.5" fill="var(--ds-accent-ink)" opacity="0.55" />
		<rect x="14" y="12" width="4" height="13" rx="1.5" fill="var(--ds-accent-ink)" opacity="0.8" />
		<rect x="21" y="7" width="4" height="18" rx="1.5" fill="var(--ds-accent-ink)" />
	</svg>
	{#if withText}
		<span class="text-[15px] font-semibold tracking-tight text-ink">DataStory</span>
	{/if}
</span>
