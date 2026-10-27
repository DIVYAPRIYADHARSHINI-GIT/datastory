<script lang="ts">
	import Icon from '../Icon.svelte';

	/** Native select, restyled. Native is the right call: it is keyboard- and mobile-correct. */
	let {
		value = $bindable(''),
		options,
		label = '',
		placeholder = '',
		size = 'md',
		disabled = false,
		class: className = ''
	}: {
		value?: string;
		options: { value: string; label: string; disabled?: boolean }[];
		label?: string;
		placeholder?: string;
		size?: 'sm' | 'md';
		disabled?: boolean;
		class?: string;
	} = $props();
</script>

<label class="block {className}">
	{#if label}
		<span class="mb-1 block text-[11px] font-medium tracking-wide text-muted uppercase">{label}</span>
	{/if}
	<div class="relative">
		<select
			bind:value
			{disabled}
			class="w-full appearance-none rounded-lg border border-line bg-surface pr-8 pl-3 font-medium text-ink transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:text-faint {size ===
			'sm'
				? 'h-8 text-[13px]'
				: 'h-10 text-sm'}"
		>
			{#if placeholder}
				<option value="" disabled>{placeholder}</option>
			{/if}
			{#each options as option (option.value)}
				<option value={option.value} disabled={option.disabled}>{option.label}</option>
			{/each}
		</select>
		<Icon
			name="chevron-down"
			size={15}
			class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted"
		/>
	</div>
</label>
