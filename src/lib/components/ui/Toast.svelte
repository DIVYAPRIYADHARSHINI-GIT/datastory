<script module lang="ts">
	/**
	 * Tiny global toast queue. Imported as `toast.success(...)` anywhere; the single
	 * <Toast /> instance in the layout renders them.
	 */
	type ToastTone = 'info' | 'success' | 'warning' | 'error';
	type ToastItem = { id: number; tone: ToastTone; message: string; detail?: string };

	let items = $state<ToastItem[]>([]);
	let seq = 0;

	function push(tone: ToastTone, message: string, detail?: string, ms = 4200) {
		const id = ++seq;
		items = [...items, { id, tone, message, detail }];
		if (ms > 0) setTimeout(() => dismiss(id), ms);
		return id;
	}

	function dismiss(id: number) {
		items = items.filter((i) => i.id !== id);
	}

	export const toast = {
		info: (message: string, detail?: string) => push('info', message, detail),
		success: (message: string, detail?: string) => push('success', message, detail),
		warning: (message: string, detail?: string) => push('warning', message, detail, 6000),
		/** Errors stay until dismissed - the user needs to read what went wrong. */
		error: (message: string, detail?: string) => push('error', message, detail, 0),
		dismiss
	};
</script>

<script lang="ts">
	import Icon from '../Icon.svelte';

	const icons = { info: 'info', success: 'check', warning: 'alert', error: 'alert' } as const;
	const tones = {
		info: 'border-line text-ink',
		success: 'border-[color-mix(in_srgb,var(--ds-positive)_35%,transparent)] text-[var(--ds-positive)]',
		warning: 'border-[color-mix(in_srgb,var(--ds-caution)_40%,transparent)] text-[var(--ds-caution)]',
		error: 'border-[color-mix(in_srgb,var(--ds-critical)_40%,transparent)] text-[var(--ds-critical)]'
	};
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:bottom-4 sm:right-4 sm:left-auto sm:items-end"
	aria-live="polite"
	role="status"
>
	{#each items as item (item.id)}
		<div
			class="rise card pointer-events-auto flex w-full max-w-sm items-start gap-3 border px-4 py-3 shadow-[var(--shadow-lift)] {tones[
				item.tone
			]}"
		>
			<Icon name={icons[item.tone]} size={17} class="mt-0.5 shrink-0" />
			<div class="min-w-0 flex-1">
				<p class="text-[13px] leading-snug font-medium">{item.message}</p>
				{#if item.detail}
					<p class="mt-0.5 text-xs leading-snug text-muted">{item.detail}</p>
				{/if}
			</div>
			<button
				onclick={() => dismiss(item.id)}
				class="-mt-0.5 -mr-1 rounded p-1 text-muted transition-colors hover:text-ink"
				aria-label="Dismiss"
			>
				<Icon name="x" size={14} />
			</button>
		</div>
	{/each}
</div>
