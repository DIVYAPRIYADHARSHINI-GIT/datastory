<script lang="ts">
	/**
	 * Global slicers. One control per filterable column, chosen automatically:
	 *   date     -> from/to date inputs
	 *   category -> multi-select dropdown with counts
	 *   number   -> dual range slider
	 *   boolean  -> three-way Yes / No / All
	 * Changing any of them updates project.filterState, which every chart and KPI reads.
	 */
	import { project } from '#lib/stores/project.svelte';
	import { settings } from '#lib/stores/settings.svelte';
	import { formatDate, formatNumber } from '#lib/format';
	import { assignRoles } from '#lib/charts/suggest';
	import Icon from './Icon.svelte';
	import Badge from './ui/Badge.svelte';

	const dataset = $derived(project.dataset);

	/**
	 * Pick the columns worth exposing as slicers, best first.
	 *
	 * These come from the SAME ranking the chart suggester uses (`assignRoles`), so the
	 * slicers match the dimensions actually on the dashboard. Ranking slicers separately -
	 * by ascending cardinality, say - produces the confusing case where "Revenue by Region"
	 * is charted but Region cannot be filtered, while a column nothing charts can be.
	 */
	const filterable = $derived.by(() => {
		if (!dataset) return [];
		const roles = assignRoles(dataset);
		const dates = roles.dates.slice(0, 1);
		const categories = roles.dimensions.filter((c) => c.type === 'category').slice(0, 2);
		const booleans = roles.dimensions.filter((c) => c.type === 'boolean').slice(0, 1);
		// One numeric range, using the measure the dashboard leads with.
		const numbers = roles.primaryMeasure ? [roles.primaryMeasure] : [];
		return [...dates, ...categories, ...booleans, ...numbers];
	});

	let openColumn = $state<string | null>(null);

	/**
	 * Close the open slicer on Escape.
	 *
	 * Each dropdown renders a full-screen transparent backdrop so an outside click closes
	 * it; without this handler, Escape leaves the dropdown open and that backdrop keeps
	 * swallowing every subsequent click on the page - including "Clear all".
	 */
	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && openColumn !== null) {
			event.stopPropagation();
			openColumn = null;
		}
	}

	function isoFor(ms: number | null): string {
		return ms === null ? '' : new Date(ms).toISOString().slice(0, 10);
	}

	function setDate(column: string, which: 'from' | 'to', value: string) {
		const existing = project.getFilter(column);
		const current =
			existing?.kind === 'date' ? existing : { kind: 'date' as const, column, from: null, to: null };
		// `to` is end-of-day so a single-day selection includes that whole day.
		const ms = value ? Date.parse(`${value}T00:00:00Z`) + (which === 'to' ? 86399999 : 0) : null;
		project.setFilter({ ...current, [which]: ms });
	}

	function toggleCategory(column: string, value: string) {
		const existing = project.getFilter(column);
		const values = existing?.kind === 'category' ? existing.values : [];
		const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
		if (next.length === 0) project.clearFilter(column);
		else project.setFilter({ kind: 'category', column, values: next });
	}

	function setNumber(column: string, which: 'min' | 'max', value: number) {
		const col = dataset?.columns.find((c) => c.name === column);
		if (!col?.numeric) return;
		const existing = project.getFilter(column);
		const current =
			existing?.kind === 'number'
				? existing
				: { kind: 'number' as const, column, min: col.numeric.min, max: col.numeric.max };
		const next = { ...current, [which]: value };
		// Never let the handles cross over.
		if (next.min > next.max) {
			if (which === 'min') next.max = next.min;
			else next.min = next.max;
		}
		project.setFilter(next);
	}

	function setBoolean(column: string, value: boolean | null) {
		if (value === null) project.clearFilter(column);
		else project.setFilter({ kind: 'boolean', column, value });
	}

	function selectedCount(column: string): number {
		const f = project.getFilter(column);
		return f?.kind === 'category' ? f.values.length : 0;
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if dataset && filterable.length > 0}
	<div class="no-print flex flex-wrap items-center gap-2">
		{#each filterable as col (col.name)}
			{#if col.type === 'date' && col.date}
				{@const f = project.getFilter(col.name)}
				{@const active = f?.kind === 'date' && (f.from !== null || f.to !== null)}
				<div class="relative">
					<button
						onclick={() => (openColumn = openColumn === col.name ? null : col.name)}
						class="flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors {active
							? 'border-accent bg-accent-soft text-accent'
							: 'border-line bg-surface text-body hover:border-line-strong'}"
					>
						<Icon name="clock" size={14} />
						{col.name}
						{#if active && f?.kind === 'date'}
							<span class="text-[11px] font-normal opacity-80">
								{f.from ? formatDate(f.from, settings.fmt) : '…'} – {f.to
									? formatDate(f.to, settings.fmt)
									: '…'}
							</span>
						{/if}
						<Icon name="chevron-down" size={13} />
					</button>

					{#if openColumn === col.name}
						<button class="fixed inset-0 z-10" onclick={() => (openColumn = null)} aria-label="Close" tabindex="-1"></button>
						<div class="card rise absolute top-full left-0 z-20 mt-1 w-64 space-y-2.5 p-3 shadow-[var(--shadow-lift)]">
							<label class="block">
								<span class="mb-1 block text-[11px] font-medium text-muted">From</span>
								<input
									type="date"
									value={f?.kind === 'date' ? isoFor(f.from) : ''}
									min={isoFor(col.date.min)}
									max={isoFor(col.date.max)}
									oninput={(e) => setDate(col.name, 'from', e.currentTarget.value)}
									class="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink"
								/>
							</label>
							<label class="block">
								<span class="mb-1 block text-[11px] font-medium text-muted">To</span>
								<input
									type="date"
									value={f?.kind === 'date' && f.to !== null ? isoFor(f.to) : ''}
									min={isoFor(col.date.min)}
									max={isoFor(col.date.max)}
									oninput={(e) => setDate(col.name, 'to', e.currentTarget.value)}
									class="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink"
								/>
							</label>
							<p class="text-[11px] text-faint">
								Data runs {formatDate(col.date.min, settings.fmt)} to {formatDate(col.date.max, settings.fmt)}
							</p>
							{#if active}
								<button
									onclick={() => project.clearFilter(col.name)}
									class="text-[12px] font-medium text-accent hover:underline"
								>
									Clear date filter
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{:else if col.type === 'category' && col.category}
				{@const count = selectedCount(col.name)}
				<div class="relative">
					<button
						onclick={() => (openColumn = openColumn === col.name ? null : col.name)}
						class="flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors {count >
						0
							? 'border-accent bg-accent-soft text-accent'
							: 'border-line bg-surface text-body hover:border-line-strong'}"
					>
						<Icon name="filter" size={14} />
						{col.name}
						{#if count > 0}
							<Badge tone="accent" size="sm">{count}</Badge>
						{/if}
						<Icon name="chevron-down" size={13} />
					</button>

					{#if openColumn === col.name}
						<button class="fixed inset-0 z-10" onclick={() => (openColumn = null)} aria-label="Close" tabindex="-1"></button>
						<div class="card rise absolute top-full left-0 z-20 mt-1 w-60 p-1 shadow-[var(--shadow-lift)]">
							<div class="max-h-64 overflow-y-auto">
								{#each col.category.top.slice(0, 40) as item (item.value)}
									{@const f = project.getFilter(col.name)}
									{@const checked = f?.kind === 'category' && f.values.includes(item.value)}
									<label
										class="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-raised"
									>
										<input
											type="checkbox"
											{checked}
											onchange={() => toggleCategory(col.name, item.value)}
											class="h-3.5 w-3.5 shrink-0 accent-[var(--ds-accent)]"
										/>
										<span class="min-w-0 flex-1 truncate text-body" title={item.value}>{item.value}</span>
										<span class="shrink-0 text-[11px] text-faint">{item.count.toLocaleString()}</span>
									</label>
								{/each}
							</div>
							{#if count > 0}
								<div class="mt-1 border-t border-line px-2.5 pt-2 pb-1">
									<button
										onclick={() => project.clearFilter(col.name)}
										class="text-[12px] font-medium text-accent hover:underline"
									>
										Clear {count} selected
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{:else if col.type === 'boolean'}
				{@const f = project.getFilter(col.name)}
				{@const value = f?.kind === 'boolean' ? f.value : null}
				<div class="flex h-9 items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
					<span class="px-2 text-[12px] font-medium text-muted">{col.name}</span>
					{#each [{ v: null, l: 'All' }, { v: true, l: 'Yes' }, { v: false, l: 'No' }] as opt (opt.l)}
						<button
							onclick={() => setBoolean(col.name, opt.v)}
							class="rounded-md px-2 py-1 text-[12px] font-medium transition-colors {value === opt.v
								? 'bg-accent text-[var(--ds-accent-ink)]'
								: 'text-body hover:bg-raised'}"
						>
							{opt.l}
						</button>
					{/each}
				</div>
			{:else if col.type === 'number' && col.numeric}
				{@const f = project.getFilter(col.name)}
				{@const lo = f?.kind === 'number' ? f.min : col.numeric.min}
				{@const hi = f?.kind === 'number' ? f.max : col.numeric.max}
				{@const active = lo > col.numeric.min || hi < col.numeric.max}
				<div class="relative">
					<button
						onclick={() => (openColumn = openColumn === col.name ? null : col.name)}
						class="flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors {active
							? 'border-accent bg-accent-soft text-accent'
							: 'border-line bg-surface text-body hover:border-line-strong'}"
					>
						<Icon name="sort" size={14} />
						{col.name}
						{#if active}
							<span class="text-[11px] font-normal opacity-80">
								{formatNumber(lo, settings.fmt)}–{formatNumber(hi, settings.fmt)}
							</span>
						{/if}
						<Icon name="chevron-down" size={13} />
					</button>

					{#if openColumn === col.name}
						{@const step = (col.numeric.max - col.numeric.min) / 100}
						<button class="fixed inset-0 z-10" onclick={() => (openColumn = null)} aria-label="Close" tabindex="-1"></button>
						<div class="card rise absolute top-full left-0 z-20 mt-1 w-64 space-y-3 p-3 shadow-[var(--shadow-lift)]">
							<div class="flex items-center justify-between text-[12px] font-medium text-ink">
								<span>{formatNumber(lo, settings.fmt)}</span>
								<span class="text-faint">to</span>
								<span>{formatNumber(hi, settings.fmt)}</span>
							</div>
							<label class="block">
								<span class="mb-1 block text-[11px] text-muted">Minimum</span>
								<input
									type="range"
									min={col.numeric.min}
									max={col.numeric.max}
									{step}
									value={lo}
									oninput={(e) => setNumber(col.name, 'min', Number(e.currentTarget.value))}
									class="w-full accent-[var(--ds-accent)]"
								/>
							</label>
							<label class="block">
								<span class="mb-1 block text-[11px] text-muted">Maximum</span>
								<input
									type="range"
									min={col.numeric.min}
									max={col.numeric.max}
									{step}
									value={hi}
									oninput={(e) => setNumber(col.name, 'max', Number(e.currentTarget.value))}
									class="w-full accent-[var(--ds-accent)]"
								/>
							</label>
							{#if active}
								<button
									onclick={() => project.clearFilter(col.name)}
									class="text-[12px] font-medium text-accent hover:underline"
								>
									Reset range
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		{/each}

		{#if project.filterState.crossFilter}
			{@const cross = project.filterState.crossFilter}
			<button
				onclick={() => project.setCrossFilter(null)}
				class="flex h-9 items-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-2.5 text-[13px] font-medium text-accent"
				title="Set by clicking a chart element"
			>
				<Icon name="spark" size={14} />
				{cross.column}: {cross.label}
				<Icon name="x" size={13} />
			</button>
		{/if}

		{#if project.hasActiveFilters}
			<button
				onclick={() => project.clearAllFilters()}
				class="flex h-9 items-center gap-1.5 px-2 text-[13px] font-medium text-muted transition-colors hover:text-ink"
			>
				<Icon name="refresh" size={14} /> Clear all
			</button>
			<span class="text-[12px] text-faint">
				{project.rows.length.toLocaleString()} of {dataset.rowCount.toLocaleString()} rows
			</span>
		{/if}
	</div>
{/if}
