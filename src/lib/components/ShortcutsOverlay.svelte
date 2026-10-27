<script lang="ts">
	import Modal from './ui/Modal.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const groups = [
		{
			title: 'Navigate',
			items: [
				{ keys: ['U'], label: 'Upload a file' },
				{ keys: ['P'], label: 'Data preview & cleaning' },
				{ keys: ['D'], label: 'Dashboard' },
				{ keys: ['S'], label: 'Story (insights)' },
				{ keys: ['B'], label: 'Custom chart builder' }
			]
		},
		{
			title: 'Dashboard',
			items: [
				{ keys: ['C'], label: 'Clear all filters' },
				{ keys: ['Alt', '←/→'], label: 'Move the focused card' },
				{ keys: ['Alt', '↑/↓'], label: 'Make the focused card wider / narrower' },
				{ keys: ['Esc'], label: 'Close fullscreen or a dialog' }
			]
		},
		{
			title: 'General',
			items: [
				{ keys: ['T'], label: 'Toggle light / dark mode' },
				{ keys: ['?'], label: 'Show or hide this list' }
			]
		}
	];
</script>

<Modal
	bind:open
	title="Keyboard shortcuts"
	description="Single keys work anywhere except while typing in a field."
>
	<div class="space-y-5">
		{#each groups as group (group.title)}
			<div>
				<h3 class="mb-2 text-[11px] font-semibold tracking-wide text-faint uppercase">
					{group.title}
				</h3>
				<ul class="space-y-1.5">
					{#each group.items as item (item.label)}
						<li class="flex items-center justify-between gap-4 text-[13px]">
							<span class="text-body">{item.label}</span>
							<span class="flex shrink-0 items-center gap-1">
								{#each item.keys as key, i (key)}
									{#if i > 0}<span class="text-[11px] text-faint">+</span>{/if}
									<kbd
										class="min-w-[22px] rounded border border-line bg-raised px-1.5 py-0.5 text-center font-mono text-[11px] text-ink"
									>
										{key}
									</kbd>
								{/each}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</Modal>
