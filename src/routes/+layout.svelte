<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ROUTES, isRoute } from '#lib/nav';
	import { project } from '#lib/stores/project.svelte';
	import { settings } from '#lib/stores/settings.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import Toast from '#lib/components/ui/Toast.svelte';
	import ShortcutsOverlay from '#lib/components/ShortcutsOverlay.svelte';

	let { children } = $props();

	// The landing page owns its own full-bleed layout; everything else gets the app chrome.
	const isLanding = $derived(isRoute(page.url.pathname, ROUTES.home));
	const hasData = $derived(project.dataset !== null);

	const nav = $derived([
		{ href: ROUTES.upload, label: 'Upload', icon: 'upload' as const, enabled: true },
		{ href: ROUTES.preview, label: 'Data', icon: 'table' as const, enabled: hasData },
		{ href: ROUTES.dashboard, label: 'Dashboard', icon: 'dashboard' as const, enabled: hasData },
		{ href: ROUTES.story, label: 'Story', icon: 'story' as const, enabled: hasData },
		{ href: ROUTES.builder, label: 'Build chart', icon: 'builder' as const, enabled: hasData },
		{ href: ROUTES.dashboards, label: 'My dashboards', icon: 'save' as const, enabled: true }
	]);

	let shortcutsOpen = $state(false);
	let mobileNavOpen = $state(false);

	/** Global keyboard shortcuts. Ignored while typing in an input. */
	function onKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const typing =
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
		if (typing) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		switch (event.key) {
			case '?':
				event.preventDefault();
				shortcutsOpen = !shortcutsOpen;
				break;
			case 'u':
				goto(ROUTES.upload);
				break;
			case 'd':
				if (hasData) goto(ROUTES.dashboard);
				break;
			case 's':
				if (hasData) goto(ROUTES.story);
				break;
			case 'p':
				if (hasData) goto(ROUTES.preview);
				break;
			case 'b':
				if (hasData) goto(ROUTES.builder);
				break;
			case 't':
				settings.toggleTheme();
				break;
			case 'c':
				if (hasData) project.clearAllFilters();
				break;
			case 'Escape':
				shortcutsOpen = false;
				mobileNavOpen = false;
				break;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head>
	<title>DataStory — turn any spreadsheet into a story</title>
</svelte:head>

{#if isLanding}
	{@render children()}
{:else}
	<div class="flex min-h-full flex-col">
		<header
			class="no-print sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--ds-surface)_86%,transparent)] backdrop-blur-md"
		>
			<div class="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
				<a href={ROUTES.home} class="shrink-0" aria-label="DataStory home">
					<Logo size={26} />
				</a>

				<nav class="ml-2 hidden items-center gap-0.5 md:flex" aria-label="Main">
					{#each nav as item (item.href)}
						{@const active = isRoute(page.url.pathname, item.href)}
						{#if item.enabled}
							<a
								href={item.href}
								class="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors {active
									? 'bg-accent-soft text-accent'
									: 'text-body hover:bg-raised hover:text-ink'}"
								aria-current={active ? 'page' : undefined}
							>
								<Icon name={item.icon} size={15} />
								{item.label}
							</a>
						{:else}
							<span
								class="flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-faint"
								title="Upload a file first"
							>
								<Icon name={item.icon} size={15} />
								{item.label}
							</span>
						{/if}
					{/each}
				</nav>

				<div class="ml-auto flex items-center gap-1">
					{#if project.readOnly}
						<span
							class="mr-1 hidden items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[11px] font-medium text-muted sm:flex"
						>
							<Icon name="lock" size={12} /> View only
						</span>
					{/if}
					{#if hasData}
						<a
							href={ROUTES.exportShare}
							class="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-body transition-colors hover:bg-raised hover:text-ink sm:flex"
						>
							<Icon name="share" size={15} /> Export
						</a>
					{/if}
					<button
						onclick={() => settings.toggleTheme()}
						class="flex h-9 w-9 items-center justify-center rounded-lg text-body transition-colors hover:bg-raised hover:text-ink"
						aria-label={settings.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
						title="Toggle theme (T)"
					>
						<Icon name={settings.isDark ? 'sun' : 'moon'} size={17} />
					</button>
					<a
						href={ROUTES.settings}
						class="flex h-9 w-9 items-center justify-center rounded-lg text-body transition-colors hover:bg-raised hover:text-ink"
						aria-label="Settings"
					>
						<Icon name="settings" size={17} />
					</a>
					<button
						onclick={() => (mobileNavOpen = !mobileNavOpen)}
						class="flex h-9 w-9 items-center justify-center rounded-lg text-body transition-colors hover:bg-raised md:hidden"
						aria-label="Menu"
						aria-expanded={mobileNavOpen}
					>
						<Icon name={mobileNavOpen ? 'x' : 'menu'} size={18} />
					</button>
				</div>
			</div>

			{#if mobileNavOpen}
				<nav class="rise border-t border-line px-3 py-2 md:hidden" aria-label="Mobile">
					{#each nav as item (item.href)}
						{@const active = isRoute(page.url.pathname, item.href)}
						<a
							href={item.enabled ? item.href : page.url.pathname}
							onclick={() => (mobileNavOpen = false)}
							aria-disabled={!item.enabled}
							class="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors {active
								? 'bg-accent-soft text-accent'
								: item.enabled
									? 'text-body hover:bg-raised'
									: 'cursor-not-allowed text-faint'}"
						>
							<Icon name={item.icon} size={16} />
							{item.label}
						</a>
					{/each}
					{#if hasData}
						<a
							href={ROUTES.exportShare}
							onclick={() => (mobileNavOpen = false)}
							class="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-body hover:bg-raised"
						>
							<Icon name="share" size={16} /> Export & share
						</a>
					{/if}
					<a
						href={ROUTES.help}
						onclick={() => (mobileNavOpen = false)}
						class="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-body hover:bg-raised"
					>
						<Icon name="help" size={16} /> Help
					</a>
				</nav>
			{/if}
		</header>

		<main class="flex-1">
			{@render children()}
		</main>

		<footer class="no-print border-t border-line px-4 py-5 sm:px-6">
			<div
				class="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 text-[12px] text-faint sm:flex-row"
			>
				<p class="flex items-center gap-1.5">
					<Icon name="shield" size={13} />
					Your data never leaves your device — every file is parsed and analysed in this browser.
				</p>
				<div class="flex items-center gap-4">
					<a href={ROUTES.help} class="transition-colors hover:text-body">Help & FAQ</a>
					<button onclick={() => (shortcutsOpen = true)} class="transition-colors hover:text-body">
						Shortcuts (?)
					</button>
				</div>
			</div>
		</footer>
	</div>
{/if}

<ShortcutsOverlay bind:open={shortcutsOpen} />
<Toast />
