<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
	type Size = 'sm' | 'md' | 'lg';

	let {
		variant = 'secondary',
		size = 'md',
		href,
		loading = false,
		full = false,
		class: className = '',
		children,
		...rest
	}: {
		variant?: Variant;
		size?: Size;
		href?: string;
		loading?: boolean;
		full?: boolean;
		class?: string;
		children: Snippet;
	} & HTMLButtonAttributes & { target?: string; rel?: string } = $props();

	const variants: Record<Variant, string> = {
		primary:
			'bg-accent text-[var(--ds-accent-ink)] hover:bg-accent-hover shadow-sm disabled:bg-line disabled:text-faint disabled:shadow-none',
		secondary:
			'bg-surface text-ink border border-line hover:border-line-strong hover:bg-raised disabled:text-faint',
		ghost: 'text-body hover:bg-accent-soft hover:text-accent disabled:text-faint',
		subtle: 'bg-accent-soft text-accent hover:brightness-95 dark:hover:brightness-125 disabled:text-faint',
		danger:
			'bg-surface text-[var(--ds-critical)] border border-[color-mix(in_srgb,var(--ds-critical)_32%,transparent)] hover:bg-[var(--ds-critical-soft)]'
	};

	const sizes: Record<Size, string> = {
		sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg',
		md: 'h-10 px-3.5 text-sm gap-2 rounded-lg',
		lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl font-medium'
	};

	const classes = $derived(
		`inline-flex items-center justify-center font-medium transition-all duration-150 select-none
		 disabled:cursor-not-allowed active:scale-[0.985] ${variants[variant]} ${sizes[size]} ${
			full ? 'w-full' : ''
		} ${className}`
	);
</script>

{#if href}
	<a {href} class={classes} aria-busy={loading} {...rest as Record<string, unknown>}>
		{@render children()}
	</a>
{:else}
	<button class={classes} disabled={rest.disabled || loading} aria-busy={loading} {...rest}>
		{#if loading}
			<span
				class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
			></span>
		{/if}
		{@render children()}
	</button>
{/if}
