<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../Icon.svelte';

	let {
		open = $bindable(false),
		title,
		description = '',
		size = 'md',
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		description?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		children: Snippet;
		footer?: Snippet;
	} = $props();

	const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' };
	let dialog = $state<HTMLDivElement | null>(null);

	function close() {
		open = false;
	}

	// Focus the panel on open so Escape works and screen readers announce the dialog.
	$effect(() => {
		if (open && dialog) dialog.focus();
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			close();
		}
		// Simple focus trap: keep Tab inside the dialog.
		if (event.key === 'Tab' && dialog) {
			const focusables = dialog.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			);
			if (focusables.length === 0) return;
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
		<button
			class="absolute inset-0 bg-[rgb(15_23_42/0.45)] backdrop-blur-[2px]"
			aria-label="Close dialog"
			onclick={close}
		></button>
		<div
			bind:this={dialog}
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			onkeydown={onKeydown}
			class="rise card relative flex max-h-[90vh] w-full {widths[
				size
			]} flex-col rounded-b-none shadow-[var(--shadow-lift)] sm:rounded-[var(--radius-card)]"
		>
			<header class="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
				<div>
					<h2 class="text-base font-semibold text-ink">{title}</h2>
					{#if description}
						<p class="mt-0.5 text-[13px] text-muted">{description}</p>
					{/if}
				</div>
				<button
					onclick={close}
					class="-mt-1 -mr-1 rounded-lg p-1.5 text-muted transition-colors hover:bg-raised hover:text-ink"
					aria-label="Close"
				>
					<Icon name="x" size={18} />
				</button>
			</header>

			<div class="flex-1 overflow-y-auto px-5 py-4">
				{@render children()}
			</div>

			{#if footer}
				<footer class="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
					{@render footer()}
				</footer>
			{/if}
		</div>
	</div>
{/if}
