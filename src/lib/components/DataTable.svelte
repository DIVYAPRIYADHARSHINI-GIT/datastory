<script lang="ts">
	/**
	 * Preview table: first 100 rows, sticky header, click-to-sort, search, and an inline
	 * type picker per column.
	 *
	 * Large-file safety: it only ever renders PREVIEW_ROWS rows. Search and sort run over
	 * the full dataset but stop collecting once the window is filled, so a 200k-row table
	 * stays instant.
	 */
	import type { CellValue, ColumnType, Dataset } from '#lib/types';
	import { PREVIEW_ROWS } from '#lib/data/parse';
	import { settings } from '#lib/stores/settings.svelte';
	import { formatDate, formatNumber } from '#lib/format';
	import Icon from './Icon.svelte';

	let {
		dataset,
		onTypeChange,
		highlightMissing = true
	}: {
		dataset: Dataset;
		onTypeChange?: (column: string, type: ColumnType) => void;
		highlightMissing?: boolean;
	} = $props();

	let search = $state('');
	let sortColumn = $state<number | null>(null);
	let sortDir = $state<'asc' | 'desc'>('asc');
	let openTypeMenu = $state<string | null>(null);

	const TYPES: { value: ColumnType; label: string; icon: 'sort' | 'table' | 'filter' | 'clock' | 'check' }[] = [
		{ value: 'number', label: 'Number', icon: 'sort' },
		{ value: 'category', label: 'Category', icon: 'filter' },
		{ value: 'text', label: 'Text', icon: 'table' },
		{ value: 'date', label: 'Date', icon: 'clock' },
		{ value: 'boolean', label: 'Yes / No', icon: 'check' }
	];

	const TYPE_TONE: Record<ColumnType, string> = {
		number: 'text-[var(--chart-2)]',
		category: 'text-accent',
		text: 'text-muted',
		date: 'text-[var(--chart-4)]',
		boolean: 'text-[var(--chart-7)]'
	};

	/** Row indices that match the search, capped at the preview window. */
	const visibleRows = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		const indices: number[] = [];

		if (sortColumn !== null) {
			// Sorting needs the whole column, so build the full index list first.
			const col = dataset.columns[sortColumn];
			const all: number[] = [];
			for (let r = 0; r < dataset.rows.length; r++) {
				if (needle && !rowMatches(dataset.rows[r], needle)) continue;
				all.push(r);
			}
			const dir = sortDir === 'asc' ? 1 : -1;
			all.sort((a, b) => {
				const va = dataset.rows[a][col.index];
				const vb = dataset.rows[b][col.index];
				// Missing values always sort last, whichever direction.
				if (va === null && vb === null) return 0;
				if (va === null) return 1;
				if (vb === null) return -1;
				if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
				if (typeof va === 'boolean' && typeof vb === 'boolean') return (Number(va) - Number(vb)) * dir;
				return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
			});
			return all.slice(0, PREVIEW_ROWS);
		}

		for (let r = 0; r < dataset.rows.length && indices.length < PREVIEW_ROWS; r++) {
			if (needle && !rowMatches(dataset.rows[r], needle)) continue;
			indices.push(r);
		}
		return indices;
	});

	/** Total matches, so the footer can say "showing 100 of 4,312 matching rows". */
	const matchCount = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		if (!needle) return dataset.rowCount;
		let count = 0;
		for (const row of dataset.rows) if (rowMatches(row, needle)) count++;
		return count;
	});

	function rowMatches(row: CellValue[], needle: string): boolean {
		for (const v of row) {
			if (v === null) continue;
			if (String(v).toLowerCase().includes(needle)) return true;
		}
		return false;
	}

	function toggleSort(index: number) {
		if (sortColumn === index) {
			if (sortDir === 'asc') sortDir = 'desc';
			else {
				sortColumn = null;
				sortDir = 'asc';
			}
		} else {
			sortColumn = index;
			sortDir = 'asc';
		}
	}

	/**
	 * Escape closes the type picker. Its outside-click backdrop is a full-screen element,
	 * so leaving the menu open would block every later click on the page.
	 */
	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && openTypeMenu !== null) {
			event.stopPropagation();
			openTypeMenu = null;
		}
	}

	/** Render a cell for display, respecting the column's type. */
	function display(value: CellValue, type: ColumnType): string {
		if (value === null || value === undefined) return '';
		if (type === 'date' && typeof value === 'number') return formatDate(value, settings.fmt);
		if (type === 'number' && typeof value === 'number') return formatNumber(value, settings.fmt);
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		return String(value);
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="card overflow-hidden">
	<!-- toolbar -->
	<div class="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
		<div class="relative min-w-[180px] flex-1">
			<Icon name="search" size={15} class="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
			<input
				bind:value={search}
				type="search"
				placeholder="Search all {dataset.rowCount.toLocaleString()} rows…"
				class="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-8 text-[13px] text-ink placeholder:text-faint"
				aria-label="Search the table"
			/>
		</div>
		{#if sortColumn !== null}
			<button
				onclick={() => {
					sortColumn = null;
					sortDir = 'asc';
				}}
				class="flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] font-medium text-muted hover:text-ink"
			>
				<Icon name="x" size={13} /> Clear sort
			</button>
		{/if}
		<span class="text-[12px] text-faint">
			{dataset.columns.length} columns · {dataset.rowCount.toLocaleString()} rows
		</span>
	</div>

	<!-- table -->
	<div class="max-h-[520px] overflow-auto">
		<table class="w-full border-collapse text-[12.5px]">
			<thead class="sticky top-0 z-10">
				<tr>
					<th
						class="sticky left-0 z-20 w-12 border-b border-line bg-raised px-2 py-2 text-right text-[10px] font-medium tracking-wide text-faint uppercase"
					>
						#
					</th>
					{#each dataset.columns as col (col.name)}
						<th class="border-b border-line bg-raised px-0 py-0 text-left align-top">
							<div class="flex min-w-[130px] flex-col gap-0.5 px-2.5 py-2">
								<button
									onclick={() => toggleSort(col.index)}
									class="group flex items-center gap-1 text-left font-semibold text-ink"
									title="Sort by {col.name}"
								>
									<span class="truncate">{col.name}</span>
									{#if sortColumn === col.index}
										<Icon name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={11} class="shrink-0 text-accent" />
									{:else}
										<Icon name="sort" size={11} class="shrink-0 text-faint opacity-0 group-hover:opacity-100" />
									{/if}
								</button>

								<div class="flex items-center gap-1.5">
									{#if onTypeChange}
										<div class="relative">
											<button
												onclick={() => (openTypeMenu = openTypeMenu === col.name ? null : col.name)}
												class="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium tracking-wide uppercase transition-colors hover:bg-surface {TYPE_TONE[
													col.type
												]}"
												title="Change the detected type"
											>
												{col.type}
												<Icon name="chevron-down" size={10} />
											</button>
											{#if openTypeMenu === col.name}
												<button
													class="fixed inset-0 z-30"
													onclick={() => (openTypeMenu = null)}
													aria-label="Close"
													tabindex="-1"
												></button>
												<div class="card absolute top-full left-0 z-40 mt-1 w-40 p-1 shadow-[var(--shadow-lift)]">
													{#each TYPES as option (option.value)}
														<button
															onclick={() => {
																onTypeChange?.(col.name, option.value);
																openTypeMenu = null;
															}}
															class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] normal-case transition-colors hover:bg-raised {col.type ===
															option.value
																? 'font-semibold text-accent'
																: 'text-body'}"
														>
															<Icon name={option.icon} size={13} />
															{option.label}
															{#if col.type === option.value}
																<Icon name="check" size={12} class="ml-auto" />
															{/if}
														</button>
													{/each}
													{#if col.overridden}
														<div class="mt-1 border-t border-line px-2 pt-1.5 pb-1">
															<button
																onclick={() => {
																	onTypeChange?.(col.name, col.detectedType);
																	openTypeMenu = null;
																}}
																class="text-[11.5px] font-medium normal-case text-accent hover:underline"
															>
																Reset to detected ({col.detectedType})
															</button>
														</div>
													{/if}
												</div>
											{/if}
										</div>
									{:else}
										<span class="px-1 text-[10px] font-medium tracking-wide uppercase {TYPE_TONE[col.type]}">
											{col.type}
										</span>
									{/if}

									{#if col.missing > 0}
										<span
											class="text-[10px] text-[var(--ds-caution)]"
											title="{col.missing.toLocaleString()} missing values"
										>
											{Math.round((col.missing / Math.max(1, dataset.rowCount)) * 100)}% empty
										</span>
									{/if}
									{#if col.overridden}
										<span class="text-[10px] text-accent" title="You changed this type by hand">edited</span>
									{/if}
								</div>
							</div>
						</th>
					{/each}
				</tr>
			</thead>

			<tbody>
				{#each visibleRows as rowIndex (rowIndex)}
					<tr class="transition-colors even:bg-raised/40 hover:bg-accent-soft/50">
						<td
							class="sticky left-0 z-[5] border-b border-line bg-surface px-2 py-1.5 text-right font-mono text-[10.5px] text-faint"
						>
							{rowIndex + 1}
						</td>
						{#each dataset.columns as col (col.name)}
							{@const value = dataset.rows[rowIndex][col.index]}
							{@const missing = value === null || value === undefined}
							<td
								class="max-w-[260px] truncate border-b border-line px-2.5 py-1.5 {col.type === 'number' ||
								col.type === 'date'
									? 'text-right font-mono text-[11.5px]'
									: ''} {missing && highlightMissing
									? 'bg-[var(--ds-caution-soft)] text-[var(--ds-caution)] italic'
									: 'text-body'}"
								title={missing ? 'Missing value' : display(value, col.type)}
							>
								{missing ? '—' : display(value, col.type)}
							</td>
						{/each}
					</tr>
				{/each}

				{#if visibleRows.length === 0}
					<tr>
						<td colspan={dataset.columns.length + 1} class="px-4 py-10 text-center">
							<p class="text-[13px] font-medium text-ink">No rows match "{search}"</p>
							<p class="mt-1 text-[12.5px] text-muted">
								Try a shorter search term, or clear the box to see every row.
							</p>
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	<!-- footer -->
	<div class="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-[11.5px] text-faint">
		<span>
			Showing {visibleRows.length.toLocaleString()} of
			{matchCount.toLocaleString()}{search ? ' matching' : ''} rows
		</span>
		{#if dataset.rowCount > PREVIEW_ROWS}
			<span>Preview is limited to {PREVIEW_ROWS} rows — charts always use every row.</span>
		{/if}
	</div>
</div>
