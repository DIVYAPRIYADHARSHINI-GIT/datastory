<script lang="ts">
	/** Settings: theme, chart palette, number/date format, currency, storage. */
	import { settings } from '#lib/stores/settings.svelte';
	import { ROUTES } from '#lib/nav';
	import type { DateFormat, NumberFormat, Theme } from '#lib/types';
	import { PALETTES } from '#lib/charts/palette';
	import { formatBytes, formatCurrency, formatDate, formatNumber } from '#lib/format';
	import { clearAll, storageAvailable, storageUsage } from '#lib/stores/storage';
	import Icon from '#lib/components/Icon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Modal from '#lib/components/ui/Modal.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';

	let usage = $state(storageUsage());
	let clearOpen = $state(false);

	const CURRENCIES = [
		{ symbol: '₹', label: 'Indian Rupee (INR)' },
		{ symbol: '$', label: 'US Dollar (USD)' },
		{ symbol: '€', label: 'Euro (EUR)' },
		{ symbol: '£', label: 'Pound Sterling (GBP)' },
		{ symbol: '¥', label: 'Japanese Yen (JPY)' },
		{ symbol: 'A$', label: 'Australian Dollar (AUD)' },
		{ symbol: 'C$', label: 'Canadian Dollar (CAD)' },
		{ symbol: 'AED ', label: 'UAE Dirham (AED)' }
	];

	const THEMES: { value: Theme; label: string; icon: 'sun' | 'moon' | 'settings' }[] = [
		{ value: 'light', label: 'Light', icon: 'sun' },
		{ value: 'dark', label: 'Dark', icon: 'moon' },
		{ value: 'system', label: 'Match system', icon: 'settings' }
	];

	const NUMBER_FORMATS: { value: NumberFormat; label: string; example: string }[] = [
		{ value: 'international', label: 'International', example: '1,234,567.89' },
		{ value: 'indian', label: 'Indian (lakh / crore)', example: '12,34,567.89' },
		{ value: 'compact', label: 'Compact', example: '1.23M' }
	];

	const DATE_FORMATS: { value: DateFormat; label: string }[] = [
		{ value: 'dmy', label: 'Day / Month / Year' },
		{ value: 'mdy', label: 'Month / Day / Year' },
		{ value: 'iso', label: 'ISO (YYYY-MM-DD)' }
	];

	// Live preview values so the user sees the effect of every option immediately.
	const sample = 1234567.891;
	const sampleDate = Date.UTC(2025, 2, 14);

	function clearEverything() {
		clearAll();
		settings.reset();
		usage = storageUsage();
		clearOpen = false;
		toast.success('All local data cleared', 'Saved dashboards and settings have been removed.');
	}
</script>

<svelte:head><title>Settings · DataStory</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6 sm:px-6">
	<header class="mb-5">
		<h1 class="text-[22px] font-semibold tracking-tight text-ink">Settings</h1>
		<p class="mt-1 text-[13.5px] text-muted">
			Applies to every dashboard in this browser. Changes save immediately.
		</p>
	</header>

	<div class="space-y-4">
		<!-- appearance -->
		<section class="card p-4">
			<h2 class="mb-3 text-[11px] font-semibold tracking-wide text-faint uppercase">Appearance</h2>

			<div class="mb-4">
				<span class="mb-1.5 block text-[13px] font-medium text-ink">Theme</span>
				<div class="flex flex-wrap gap-1.5">
					{#each THEMES as option (option.value)}
						<button
							onclick={() => settings.setTheme(option.value)}
							class="flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors {settings
								.current.theme === option.value
								? 'border-accent bg-accent-soft text-accent'
								: 'border-line text-body hover:border-line-strong hover:bg-raised'}"
						>
							<Icon name={option.icon} size={15} />
							{option.label}
						</button>
					{/each}
				</div>
				<p class="mt-1.5 text-[12px] text-faint">
					Currently showing the {settings.isDark ? 'dark' : 'light'} interface. Press
					<kbd class="rounded border border-line bg-raised px-1 font-mono text-[10.5px]">T</kbd>
					anywhere to toggle.
				</p>
			</div>

			<label class="flex items-start gap-3">
				<input
					type="checkbox"
					checked={settings.current.animations}
					onchange={(e) => settings.update({ animations: e.currentTarget.checked })}
					class="mt-0.5 h-4 w-4 accent-[var(--ds-accent)]"
				/>
				<span>
					<span class="block text-[13px] font-medium text-ink">Chart animations</span>
					<span class="block text-[12px] text-muted">
						Turn off for snappier redraws on large dashboards. Reduced-motion system settings are
						always respected regardless of this option.
					</span>
				</span>
			</label>
		</section>

		<!-- chart palette -->
		<section class="card p-4">
			<h2 class="mb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">
				Default chart palette
			</h2>
			<p class="mb-3 text-[12.5px] text-muted">
				Each palette has separate light and dark variants, so series stay readable in both themes.
			</p>

			<div class="space-y-1.5">
				{#each PALETTES as palette (palette.id)}
					{@const colors = settings.isDark ? palette.dark : palette.light}
					<button
						onclick={() => settings.update({ palette: palette.id })}
						class="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors {settings
							.current.palette === palette.id
							? 'border-accent bg-accent-soft'
							: 'border-line hover:border-line-strong hover:bg-raised'}"
					>
						<span class="flex shrink-0 gap-0.5">
							{#each colors.slice(0, 7) as color (color)}
								<span class="h-5 w-3 rounded-sm" style="background: {color}"></span>
							{/each}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block text-[13px] font-medium text-ink">{palette.name}</span>
							<span class="block text-[11.5px] text-muted">{palette.description}</span>
						</span>
						{#if settings.current.palette === palette.id}
							<Icon name="check" size={16} class="shrink-0 text-accent" />
						{/if}
					</button>
				{/each}
			</div>
		</section>

		<!-- formats -->
		<section class="card p-4">
			<h2 class="mb-3 text-[11px] font-semibold tracking-wide text-faint uppercase">
				Numbers, dates & currency
			</h2>

			<div class="mb-4">
				<span class="mb-1.5 block text-[13px] font-medium text-ink">Number format</span>
				<div class="space-y-1.5">
					{#each NUMBER_FORMATS as option (option.value)}
						<label
							class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors {settings
								.current.numberFormat === option.value
								? 'border-accent bg-accent-soft'
								: 'border-line hover:border-line-strong'}"
						>
							<input
								type="radio"
								name="numberFormat"
								value={option.value}
								checked={settings.current.numberFormat === option.value}
								onchange={() => settings.update({ numberFormat: option.value })}
								class="accent-[var(--ds-accent)]"
							/>
							<span class="flex-1 text-[13px] font-medium text-ink">{option.label}</span>
							<span class="font-mono text-[12px] text-muted">{option.example}</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="mb-4">
				<span class="mb-1.5 block text-[13px] font-medium text-ink">Date format</span>
				<div class="flex flex-wrap gap-1.5">
					{#each DATE_FORMATS as option (option.value)}
						<button
							onclick={() => settings.update({ dateFormat: option.value })}
							class="rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors {settings
								.current.dateFormat === option.value
								? 'border-accent bg-accent-soft text-accent'
								: 'border-line text-body hover:border-line-strong hover:bg-raised'}"
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="mb-4">
				<span class="mb-1.5 block text-[13px] font-medium text-ink">Currency symbol</span>
				<div class="flex flex-wrap gap-1.5">
					{#each CURRENCIES as currency (currency.symbol)}
						<button
							onclick={() => settings.update({ currency: currency.symbol })}
							title={currency.label}
							class="min-w-[44px] rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors {settings
								.current.currency === currency.symbol
								? 'border-accent bg-accent-soft text-accent'
								: 'border-line text-body hover:border-line-strong hover:bg-raised'}"
						>
							{currency.symbol.trim()}
						</button>
					{/each}
				</div>
				<p class="mt-1.5 text-[12px] text-faint">
					Applied to columns whose name looks monetary (revenue, price, salary, cost, and similar).
				</p>
			</div>

			<label class="block">
				<span class="mb-1.5 block text-[13px] font-medium text-ink">
					Decimal places — up to {settings.current.decimals}
				</span>
				<input
					type="range"
					min="0"
					max="4"
					value={settings.current.decimals}
					oninput={(e) => settings.update({ decimals: Number(e.currentTarget.value) })}
					class="w-full max-w-xs accent-[var(--ds-accent)]"
				/>
			</label>

			<!-- live preview -->
			<div class="mt-4 rounded-lg bg-raised px-3.5 py-3">
				<p class="mb-1.5 text-[11px] font-semibold tracking-wide text-faint uppercase">Preview</p>
				<dl class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-3">
					<div>
						<dt class="text-muted">Number</dt>
						<dd class="font-mono font-medium text-ink">{formatNumber(sample, settings.fmt)}</dd>
					</div>
					<div>
						<dt class="text-muted">Currency</dt>
						<dd class="font-mono font-medium text-ink">{formatCurrency(sample, settings.fmt)}</dd>
					</div>
					<div>
						<dt class="text-muted">Date</dt>
						<dd class="font-mono font-medium text-ink">{formatDate(sampleDate, settings.fmt)}</dd>
					</div>
				</dl>
			</div>
		</section>

		<!-- storage -->
		<section class="card p-4">
			<h2 class="mb-3 text-[11px] font-semibold tracking-wide text-faint uppercase">
				Data stored in this browser
			</h2>

			{#if storageAvailable()}
				<dl class="mb-3 grid grid-cols-2 gap-3 text-[13px]">
					<div class="rounded-lg bg-raised px-3 py-2.5">
						<dt class="text-[12px] text-muted">Saved dashboards</dt>
						<dd class="mt-0.5 text-[18px] font-semibold text-ink">{usage.dashboards}</dd>
					</div>
					<div class="rounded-lg bg-raised px-3 py-2.5">
						<dt class="text-[12px] text-muted">Storage used</dt>
						<dd class="mt-0.5 text-[18px] font-semibold text-ink">{formatBytes(usage.bytes)}</dd>
					</div>
				</dl>
				<p class="mb-3 text-[12.5px] leading-relaxed text-muted">
					Dashboards are saved with their cleaned data so they reopen without the original file.
					Browsers typically allow about 5 MB per site, which is why very large datasets may fail to
					save.
				</p>
				<div class="flex flex-wrap gap-2">
					<Button href={ROUTES.dashboards}>
						<Icon name="save" size={15} /> Manage dashboards
					</Button>
					<Button variant="danger" onclick={() => (clearOpen = true)}>
						<Icon name="trash" size={15} /> Clear all local data
					</Button>
				</div>
			{:else}
				<p class="text-[12.5px] leading-relaxed text-muted">
					This browser is blocking local storage, so nothing is being stored. Settings reset when you
					reload, and dashboards cannot be saved — but uploading, analysing and exporting all still
					work.
				</p>
			{/if}
		</section>

		<!-- reset -->
		<section class="card flex flex-wrap items-center justify-between gap-3 p-4">
			<div>
				<h2 class="text-[13px] font-semibold text-ink">Reset preferences</h2>
				<p class="mt-0.5 text-[12.5px] text-muted">
					Back to the defaults: system theme, Signature palette, international numbers, INR.
				</p>
			</div>
			<Button
				onclick={() => {
					settings.reset();
					toast.success('Preferences reset');
				}}
			>
				<Icon name="refresh" size={15} /> Reset
			</Button>
		</section>
	</div>
</div>

<Modal bind:open={clearOpen} title="Clear all local data?" size="sm">
	<p class="text-[13px] leading-relaxed text-body">
		This removes every saved dashboard ({usage.dashboards}) and all preferences from this browser.
		DataStory has no server copy, so this cannot be undone. Export anything you want to keep first.
	</p>
	{#snippet footer()}
		<Button onclick={() => (clearOpen = false)}>Cancel</Button>
		<Button variant="danger" onclick={clearEverything}>
			<Icon name="trash" size={15} /> Clear everything
		</Button>
	{/snippet}
</Modal>
