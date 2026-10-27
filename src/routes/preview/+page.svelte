<script lang="ts">
	/**
	 * Data preview & cleaning.
	 * Left: the table with type pickers. Right: health score, quality issues, one-click
	 * cleaning actions and the before/after log.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ROUTES } from '#lib/nav';
	import { project } from '#lib/stores/project.svelte';
	import { settings } from '#lib/stores/settings.svelte';
	import type { CleanAction, FillStrategy } from '#lib/types';
	import DataTable from '#lib/components/DataTable.svelte';
	import HealthScore from '#lib/components/HealthScore.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';

	onMount(() => {
		if (!project.dataset) void goto(ROUTES.upload);
	});

	const dataset = $derived(project.dataset);
	const report = $derived(project.report);
	const before = $derived(project.cleanLog.length > 0 ? project.originalReport : null);

	let fillStrategy = $state<FillStrategy>('median');
	let busyAction = $state<string | null>(null);

	const SEVERITY_TONE = { critical: 'critical', warning: 'caution', info: 'neutral' } as const;

	const fillOptions = [
		{ value: 'median', label: 'Median (numbers) / most common (text)' },
		{ value: 'mean', label: 'Mean (numbers) / most common (text)' },
		{ value: 'mode', label: 'Most common value' },
		{ value: 'zero', label: 'Zero' },
		{ value: 'drop-row', label: 'Drop the whole row' }
	];

	/** Run a cleaning action with a short busy state so the change is visible. */
	async function run(action: CleanAction, key: string) {
		busyAction = key;
		await new Promise((r) => setTimeout(r, 120));
		const step = project.clean(action);
		busyAction = null;
		if (!step) return;
		if (step.rowsRemoved === 0 && step.cellsChanged === 0) toast.info(step.label);
		else toast.success(step.label);
	}

	async function cleanEverything() {
		busyAction = 'all';
		await new Promise((r) => setTimeout(r, 180));
		const steps = project.cleanAll();
		busyAction = null;
		if (steps.length === 0) {
			toast.info('Nothing to clean', 'This dataset has no duplicates, gaps or stray spaces.');
			return;
		}
		toast.success(
			`${steps.length} cleaning step${steps.length === 1 ? '' : 's'} applied`,
			`Health score is now ${project.report?.score ?? 0}/100.`
		);
	}

	function openDashboard() {
		project.buildDashboard();
		void goto(ROUTES.dashboard);
	}

	/** Columns with gaps, for the fill-missing action's scope note. */
	const missingColumns = $derived(dataset ? dataset.columns.filter((c) => c.missing > 0) : []);
</script>

<svelte:head><title>Data preview & cleaning · DataStory</title></svelte:head>

{#if dataset && report}
	<div class="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
		<!-- header -->
		<header class="mb-5 flex flex-wrap items-start justify-between gap-4">
			<div class="min-w-0">
				<div class="flex items-center gap-2">
					<h1 class="truncate text-[22px] font-semibold tracking-tight text-ink">{dataset.name}</h1>
					{#if dataset.sheet}
						<Badge>Sheet: {dataset.sheet}</Badge>
					{/if}
					{#if dataset.source === 'sample'}
						<Badge tone="accent">Sample</Badge>
					{/if}
				</div>
				<p class="mt-1 text-[13.5px] text-muted">
					{dataset.rowCount.toLocaleString()} rows · {dataset.columns.length} columns · check the detected
					types below, clean what needs cleaning, then build the dashboard.
				</p>
			</div>

			<div class="flex min-w-0 flex-wrap items-center gap-2">
				<Button href={ROUTES.upload}>
					<Icon name="upload" size={15} /> New file
				</Button>
				<Button variant="primary" onclick={openDashboard}>
					Build dashboard <Icon name="arrow-right" size={15} />
				</Button>
			</div>
		</header>

		<!-- parser warnings -->
		{#if project.warnings.length > 0 || project.truncated || dataset.skippedEmptyRows > 0}
			<div
				class="mb-4 flex items-start gap-3 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--ds-caution)_32%,transparent)] bg-[var(--ds-caution-soft)] px-4 py-3"
			>
				<Icon name="info" size={17} class="mt-0.5 shrink-0 text-[var(--ds-caution)]" />
				<div>
					<p class="text-[13px] font-semibold text-[var(--ds-caution)]">
						Notes from reading the file
					</p>
					<ul class="mt-1 space-y-0.5 text-[12.5px] text-body">
						{#each project.warnings as warning (warning)}
							<li>• {warning}</li>
						{/each}
						{#if dataset.skippedEmptyRows > 0}
							<li>
								• {dataset.skippedEmptyRows.toLocaleString()} completely blank row{dataset.skippedEmptyRows ===
								1
									? ''
									: 's'} were skipped while reading the file, so they are not counted below.
							</li>
						{/if}
					</ul>
				</div>
			</div>
		{/if}

		<div class="grid gap-4 xl:grid-cols-[1fr_360px]">
			<!-- ------------------------------ table ------------------------------ -->
			<div class="order-2 min-w-0 xl:order-1">
				<DataTable {dataset} onTypeChange={(col, type) => project.setColumnType(col, type)} />

				<!-- column summary strip -->
				<div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{#each dataset.columns.slice(0, 12) as col (col.name)}
						<div class="card px-3 py-2.5">
							<div class="flex items-baseline justify-between gap-2">
								<p class="truncate text-[12.5px] font-semibold text-ink" title={col.name}>{col.name}</p>
								<span class="shrink-0 text-[10px] tracking-wide text-faint uppercase">{col.type}</span>
							</div>
							<p class="mt-1 text-[11.5px] text-muted">
								{#if col.type === 'number' && col.numeric}
									min {col.numeric.min.toLocaleString(undefined, { maximumFractionDigits: 2 })} ·
									median {col.numeric.median.toLocaleString(undefined, { maximumFractionDigits: 2 })} ·
									max {col.numeric.max.toLocaleString(undefined, { maximumFractionDigits: 2 })}
								{:else if col.type === 'date' && col.date}
									{new Date(col.date.min).toISOString().slice(0, 10)} → {new Date(col.date.max)
										.toISOString()
										.slice(0, 10)} ({col.date.granularity})
								{:else}
									{col.distinctCount.toLocaleString()} distinct{#if col.category?.top?.[0]}
										· top: {col.category.top[0].value}{/if}
								{/if}
							</p>
							{#if col.missing > 0}
								<p class="mt-1 text-[11px] text-[var(--ds-caution)]">
									{col.missing.toLocaleString()} missing
								</p>
							{/if}
						</div>
					{/each}
					{#if dataset.columns.length > 12}
						<div class="card flex items-center justify-center px-3 py-2.5 text-[12px] text-faint">
							+{dataset.columns.length - 12} more columns in the table above
						</div>
					{/if}
				</div>
			</div>

			<!-- ------------------------- quality sidebar ------------------------- -->
			<aside class="order-1 space-y-4 xl:order-2">
				<!-- health score -->
				<div class="card p-4">
					<h2 class="mb-3 text-[11px] font-semibold tracking-wide text-faint uppercase">
						Analysis health score
					</h2>
					<HealthScore {report} {before} />

					<dl class="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3.5 text-[12px]">
						<div>
							<dt class="text-muted">Missing cells</dt>
							<dd class="font-semibold text-ink">
								{report.missingCells.toLocaleString()}
								<span class="font-normal text-faint">
									({((report.missingCells / report.totalCells) * 100).toFixed(1)}%)
								</span>
							</dd>
						</div>
						<div>
							<dt class="text-muted">Duplicate rows</dt>
							<dd class="font-semibold text-ink">{report.duplicateRows.length.toLocaleString()}</dd>
						</div>
						<div>
							<dt class="text-muted">Empty rows</dt>
							<dd class="font-semibold text-ink">{report.emptyRows.length.toLocaleString()}</dd>
						</div>
						<div>
							<dt class="text-muted">Outlier values</dt>
							<dd class="font-semibold text-ink">{report.outlierCells.toLocaleString()}</dd>
						</div>
					</dl>
				</div>

				<!-- cleaning actions -->
				<div class="card p-4">
					<div class="mb-3 flex items-center justify-between gap-2">
						<h2 class="text-[11px] font-semibold tracking-wide text-faint uppercase">
							One-click cleaning
						</h2>
						{#if project.cleanLog.length > 0}
							<button
								onclick={() => {
									project.revertCleaning();
									toast.info('Reverted to the file as imported');
								}}
								class="text-[11.5px] font-medium text-accent hover:underline"
							>
								Revert all
							</button>
						{/if}
					</div>

					<Button
						variant="primary"
						full
						loading={busyAction === 'all'}
						onclick={cleanEverything}
						class="mb-3"
					>
						<Icon name="broom" size={16} /> Clean everything
					</Button>

					<div class="space-y-1.5">
						{#each [{ key: 'remove-duplicates', action: { id: 'remove-duplicates' } as CleanAction, icon: 'duplicate' as const, label: 'Remove duplicate rows', count: report.duplicateRows.length }, { key: 'drop-empty-rows', action: { id: 'drop-empty-rows' } as CleanAction, icon: 'trash' as const, label: 'Drop empty rows', count: report.emptyRows.length }, { key: 'trim-spaces', action: { id: 'trim-spaces' } as CleanAction, icon: 'broom' as const, label: 'Trim extra spaces', count: report.untrimmedCells }, { key: 'standardize-dates', action: { id: 'standardize-dates' } as CleanAction, icon: 'clock' as const, label: 'Standardize date formats', count: dataset.columns.filter((c) => c.type === 'date').length }] as item (item.key)}
							<button
								onclick={() => run(item.action, item.key)}
								disabled={item.count === 0 || busyAction !== null}
								class="flex w-full items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-left transition-colors enabled:hover:border-line-strong enabled:hover:bg-raised disabled:opacity-45"
							>
								<Icon name={item.icon} size={16} class="shrink-0 text-muted" />
								<span class="flex-1 text-[13px] font-medium text-ink">{item.label}</span>
								{#if busyAction === item.key}
									<span
										class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent"
									></span>
								{:else if item.count > 0}
									<Badge size="sm" tone="caution">{item.count.toLocaleString()}</Badge>
								{:else}
									<Icon name="check" size={14} class="text-[var(--ds-positive)]" />
								{/if}
							</button>
						{/each}
					</div>

					<!-- fill missing: needs a strategy, so it gets its own block -->
					<div class="mt-3 rounded-lg border border-line p-3">
						<div class="mb-2 flex items-center gap-2">
							<Icon name="spark" size={15} class="text-muted" />
							<span class="flex-1 text-[13px] font-medium text-ink">Fill missing values</span>
							{#if report.missingCells > 0}
								<Badge size="sm" tone="caution">{report.missingCells.toLocaleString()}</Badge>
							{/if}
						</div>
						<Select
							bind:value={fillStrategy as string}
							options={fillOptions}
							size="sm"
							label="Strategy"
							class="mb-2"
						/>
						<p class="mb-2.5 text-[11.5px] leading-snug text-faint">
							{#if missingColumns.length === 0}
								No gaps to fill — every cell has a value.
							{:else}
								Affects {missingColumns.length} column{missingColumns.length === 1 ? '' : 's'}:
								{missingColumns
									.slice(0, 3)
									.map((c) => c.name)
									.join(', ')}{missingColumns.length > 3 ? `, +${missingColumns.length - 3} more` : ''}.
								Dates are only ever filled with the most common value, never an average.
							{/if}
						</p>
						<Button
							size="sm"
							full
							disabled={report.missingCells === 0 || busyAction !== null}
							loading={busyAction === 'fill'}
							onclick={() => run({ id: 'fill-missing', strategy: fillStrategy }, 'fill')}
						>
							Apply fill
						</Button>
					</div>
				</div>

				<!-- quality issues -->
				<div class="card p-4">
					<h2 class="mb-3 text-[11px] font-semibold tracking-wide text-faint uppercase">
						Data quality — {report.issues.length} finding{report.issues.length === 1 ? '' : 's'}
					</h2>
					{#if report.issues.length === 0}
						<div class="flex items-start gap-2.5 rounded-lg bg-[var(--ds-positive-soft)] px-3 py-2.5">
							<Icon name="check" size={16} class="mt-0.5 shrink-0 text-[var(--ds-positive)]" />
							<p class="text-[12.5px] leading-relaxed text-body">
								No quality problems found. Every column parsed cleanly, there are no duplicates and no
								gaps.
							</p>
						</div>
					{:else}
						<ul class="max-h-[340px] space-y-1.5 overflow-y-auto pr-1">
							{#each report.issues as issue (issue.kind + (issue.column ?? '') + issue.count)}
								<li class="flex items-start gap-2.5 rounded-lg border border-line px-2.5 py-2">
									<Badge size="sm" tone={SEVERITY_TONE[issue.severity]}>
										{issue.severity}
									</Badge>
									<p class="flex-1 text-[12px] leading-snug text-body">{issue.message}</p>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- clean log -->
				{#if project.cleanLog.length > 0}
					<div class="card p-4">
						<h2 class="mb-3 text-[11px] font-semibold tracking-wide text-faint uppercase">
							What was changed
						</h2>
						<ol class="space-y-2">
							{#each project.cleanLog as step, i (step.at + i)}
								<li class="flex items-start gap-2.5">
									<span
										class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[9px] font-semibold text-accent"
									>
										{i + 1}
									</span>
									<div class="min-w-0">
										<p class="text-[12.5px] leading-snug text-body">{step.label}</p>
										{#if step.rowsRemoved > 0}
											<p class="text-[11px] text-faint">
												{step.rowsRemoved.toLocaleString()} rows removed
											</p>
										{/if}
									</div>
								</li>
							{/each}
						</ol>
						{#if project.original && before}
							<div class="mt-3 border-t border-line pt-3 text-[12px]">
								<p class="text-muted">
									<span class="font-medium text-ink">
										{project.original.rowCount.toLocaleString()} → {dataset.rowCount.toLocaleString()} rows
									</span>
									· health {before.score} → {report.score}
								</p>
							</div>
						{/if}
					</div>
				{/if}
			</aside>
		</div>

		<!-- bottom CTA -->
		<div class="card mt-5 flex flex-wrap items-center justify-between gap-4 px-5 py-4">
			<div>
				<p class="text-[14px] font-semibold text-ink">Ready when you are</p>
				<p class="mt-0.5 text-[13px] text-muted">
					DataStory will pick the charts that suit these {dataset.columns.length} columns and write the
					story behind them.
				</p>
			</div>
			<Button variant="primary" size="lg" onclick={openDashboard}>
				<Icon name="spark" size={17} /> Build my dashboard
			</Button>
		</div>
	</div>
{:else}
	<!-- Guard state while redirecting to /upload -->
	<div class="mx-auto max-w-4xl px-4 py-16">
		<div class="card space-y-3 p-6">
			<div class="skeleton h-6 w-48"></div>
			<div class="skeleton h-40"></div>
		</div>
	</div>
{/if}
