<script lang="ts">
	/** My Dashboards: saved dashboards with thumbnail, open / duplicate / delete. */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { SavedDashboard } from '#lib/types';
	import { project } from '#lib/stores/project.svelte';
	import { ROUTES } from '#lib/nav';
	import {
		deleteDashboard,
		duplicateDashboard,
		getDashboard,
		loadDashboards,
		storageAvailable,
		storageUsage
	} from '#lib/stores/storage';
	import { formatBytes, formatRelative } from '#lib/format';
	import Icon from '#lib/components/Icon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Modal from '#lib/components/ui/Modal.svelte';
	import EmptyState from '#lib/components/ui/EmptyState.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';

	let dashboards = $state<SavedDashboard[]>([]);
	let usage = $state({ bytes: 0, dashboards: 0 });
	let pendingDelete = $state<SavedDashboard | null>(null);
	let deleteOpen = $state(false);

	function refresh() {
		dashboards = loadDashboards();
		usage = storageUsage();
	}

	onMount(() => {
		refresh();
		// ?open=<id>&view=1 is how a share link lands here.
		const openId = page.url.searchParams.get('open');
		if (openId) {
			const found = getDashboard(openId);
			if (found) {
				open(found, page.url.searchParams.get('view') === '1');
			} else {
				toast.error(
					'That dashboard is not in this browser',
					'DataStory share links only work on the device that saved the dashboard, because there is no server. Ask for the PDF or PNG export instead.'
				);
			}
		}
	});

	function open(dashboard: SavedDashboard, readOnly = false) {
		project.restore(dashboard, readOnly);
		void goto(ROUTES.dashboard);
	}

	function duplicate(id: string) {
		const copy = duplicateDashboard(id);
		refresh();
		if (copy) toast.success(`"${copy.name}" created`);
	}

	function confirmDelete() {
		if (!pendingDelete) return;
		const name = pendingDelete.name;
		dashboards = deleteDashboard(pendingDelete.id);
		usage = storageUsage();
		// Clear the working project if we just deleted the dashboard it came from.
		if (project.savedId === pendingDelete.id) {
			project.savedId = null;
		}
		pendingDelete = null;
		deleteOpen = false;
		toast.success(`"${name}" deleted`);
	}
</script>

<svelte:head><title>My dashboards · DataStory</title></svelte:head>

<div class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<header class="mb-5 flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-[22px] font-semibold tracking-tight text-ink">My dashboards</h1>
			<p class="mt-1 text-[13.5px] text-muted">
				{#if dashboards.length > 0}
					{dashboards.length} saved in this browser · {formatBytes(usage.bytes)} of local storage used
				{:else}
					Dashboards you save are kept in this browser — no account, no cloud.
				{/if}
			</p>
		</div>
		<Button variant="primary" href={ROUTES.upload}>
			<Icon name="upload" size={15} /> New dashboard
		</Button>
	</header>

	{#if !storageAvailable()}
		<div
			class="mb-4 flex items-start gap-3 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--ds-caution)_32%,transparent)] bg-[var(--ds-caution-soft)] px-4 py-3"
		>
			<Icon name="alert" size={17} class="mt-0.5 shrink-0 text-[var(--ds-caution)]" />
			<div>
				<p class="text-[13px] font-semibold text-[var(--ds-caution)]">Local storage is blocked</p>
				<p class="mt-1 text-[12.5px] text-body">
					This browser will not let DataStory store anything — usually private browsing, or site data
					turned off. You can still upload, analyse and export; you just cannot save dashboards for
					later.
				</p>
			</div>
		</div>
	{/if}

	{#if dashboards.length === 0}
		<div class="card">
			<EmptyState
				icon="dashboard"
				title="No saved dashboards yet"
				message="Upload a spreadsheet, build a dashboard, then use Export & share to save it here. Saved dashboards keep their cleaned data, so they reopen without the original file."
			>
				{#snippet action()}
					<Button variant="primary" href={ROUTES.upload}>
						<Icon name="upload" size={15} /> Upload a file
					</Button>
					<Button href="{ROUTES.upload}?sample=sales">Try a sample dataset</Button>
				{/snippet}
			</EmptyState>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each dashboards as dashboard (dashboard.id)}
				<article class="card group flex flex-col overflow-hidden">
					<button
						onclick={() => open(dashboard)}
						class="block w-full bg-canvas p-3 text-left transition-colors hover:bg-raised"
						aria-label="Open {dashboard.name}"
					>
						<div class="overflow-hidden rounded-lg">
							{@html dashboard.thumbnail}
						</div>
					</button>

					<div class="flex flex-1 flex-col gap-1.5 border-t border-line px-3.5 py-3">
						<div class="flex items-start justify-between gap-2">
							<h2 class="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink" title={dashboard.name}>
								{dashboard.name}
							</h2>
							<Badge
								size="sm"
								tone={dashboard.healthScore >= 75
									? 'positive'
									: dashboard.healthScore >= 55
										? 'caution'
										: 'critical'}
							>
								{dashboard.healthScore}
							</Badge>
						</div>

						<p class="text-[12px] text-muted">
							{dashboard.rowCount.toLocaleString()} rows · {dashboard.columnCount} columns ·
							{dashboard.charts.filter((c) => !c.hidden).length} charts
						</p>
						<p class="text-[11.5px] text-faint">
							Updated {formatRelative(dashboard.updatedAt)}
						</p>

						<div class="mt-auto flex items-center gap-1 pt-2">
							<Button size="sm" variant="primary" onclick={() => open(dashboard)} class="flex-1">
								<Icon name="open" size={14} /> Open
							</Button>
							<button
								onclick={() => duplicate(dashboard.id)}
								class="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink"
								aria-label="Duplicate {dashboard.name}"
								title="Duplicate"
							>
								<Icon name="duplicate" size={15} />
							</button>
							<button
								onclick={() => {
									pendingDelete = dashboard;
									deleteOpen = true;
								}}
								class="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--ds-critical-soft)] hover:text-[var(--ds-critical)]"
								aria-label="Delete {dashboard.name}"
								title="Delete"
							>
								<Icon name="trash" size={15} />
							</button>
						</div>
					</div>
				</article>
			{/each}
		</div>

		<p class="mt-5 flex items-start gap-2 text-[12px] leading-relaxed text-faint">
			<Icon name="info" size={14} class="mt-0.5 shrink-0" />
			Saved dashboards live in this browser's local storage, which browsers can clear when space
			runs low or when you clear site data. Export a PDF for anything you need to keep.
		</p>
	{/if}
</div>

<Modal
	bind:open={deleteOpen}
	title="Delete this dashboard?"
	description={pendingDelete ? `"${pendingDelete.name}" will be removed from this browser.` : ''}
	size="sm"
>
	<p class="text-[13px] leading-relaxed text-body">
		The cleaned data saved with it goes too. This cannot be undone, and DataStory has no server
		copy to restore from.
	</p>
	{#snippet footer()}
		<Button
			onclick={() => {
				deleteOpen = false;
				pendingDelete = null;
			}}
		>
			Keep it
		</Button>
		<Button variant="danger" onclick={confirmDelete}>
			<Icon name="trash" size={15} /> Delete
		</Button>
	{/snippet}
</Modal>
