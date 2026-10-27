<script lang="ts">
	/** Export & share: PDF, PNG, cleaned CSV, save to My Dashboards, and a share link. */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { project } from '#lib/stores/project.svelte';
	import { settings } from '#lib/stores/settings.svelte';
	import { ROUTES } from '#lib/nav';
	import { computeKpi } from '#lib/charts/kpis';
	import { toCsv } from '#lib/analysis/clean';
	import { formatDate } from '#lib/format';
	import { captureCharts } from '#lib/export/capture';
	import {
		buildThumbnail,
		download,
		exportDashboardPng,
		exportPdf,
		slugify
	} from '#lib/export/report';
	import { paletteColors } from '#lib/charts/palette';
	import { StorageError, storageAvailable } from '#lib/stores/storage';
	import Icon from '#lib/components/Icon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';

	onMount(() => {
		if (!project.dataset) void goto(ROUTES.upload);
		name = project.savedName || project.dataset?.name || 'My dashboard';
	});

	const dataset = $derived(project.dataset);
	const report = $derived(project.report);

	let name = $state('');
	let busy = $state<string | null>(null);
	let progress = $state('');
	let shareCopied = $state(false);

	const kpiValues = $derived.by(() => {
		if (!dataset) return [];
		return project.kpis.map((spec) => computeKpi(dataset, project.rows, spec, settings.fmt));
	});

	/** Share link carries the saved dashboard id, so the recipient opens it read-only. */
	const shareUrl = $derived(
		project.savedId
			? `${page.url.origin}${ROUTES.dashboards}?open=${project.savedId}&view=1`
			: ''
	);

	async function capture(onEach?: (d: number, t: number) => void) {
		if (!dataset) return [];
		return captureCharts({
			dataset,
			rows: project.rows,
			specs: project.visibleCharts,
			fmt: settings.fmt,
			palette: settings.current.palette,
			dark: settings.isDark,
			onProgress: onEach
		});
	}

	async function doPdf() {
		if (!dataset || !report) return;
		busy = 'pdf';
		try {
			progress = 'Rendering charts…';
			const chartImages = await capture((d, t) => (progress = `Rendering chart ${d} of ${t}…`));
			progress = 'Building the PDF…';
			await exportPdf({
				name: name || dataset.name,
				dataset,
				report,
				kpis: kpiValues,
				insights: project.insights,
				cleanLog: project.cleanLog,
				filters: project.filterSummary,
				rowsAfterFilters: project.rows.length,
				chartImages
			});
			toast.success('PDF downloaded');
		} catch (err) {
			toast.error(
				'The PDF export failed',
				err instanceof Error ? err.message : 'Try again, or export as PNG instead.'
			);
		} finally {
			busy = null;
			progress = '';
		}
	}

	async function doPng() {
		if (!dataset) return;
		busy = 'png';
		try {
			progress = 'Rendering charts…';
			const chartImages = await capture((d, t) => (progress = `Rendering chart ${d} of ${t}…`));
			progress = 'Stitching the image…';
			const subtitle = [
				`${project.rows.length.toLocaleString()} rows`,
				`${project.visibleCharts.length} charts`,
				project.filterSummary.length ? `Filters: ${project.filterSummary.join(' | ')}` : null
			]
				.filter(Boolean)
				.join('  ·  ');
			await exportDashboardPng({
				name: name || dataset.name,
				subtitle,
				kpis: kpiValues,
				chartImages,
				dark: settings.isDark
			});
			toast.success('Dashboard PNG downloaded');
		} catch (err) {
			toast.error(
				'The PNG export failed',
				err instanceof Error ? err.message : 'Try exporting individual charts from the dashboard instead.'
			);
		} finally {
			busy = null;
			progress = '';
		}
	}

	function doCsv() {
		if (!dataset) return;
		busy = 'csv';
		try {
			const csv = toCsv(dataset, (ms) => formatDate(ms, settings.fmt));
			download(
				new Blob([csv], { type: 'text/csv;charset=utf-8' }),
				`${slugify(name || dataset.name)}-cleaned.csv`
			);
			toast.success('Cleaned CSV downloaded', `${dataset.rowCount.toLocaleString()} rows exported.`);
		} catch (err) {
			toast.error('The CSV export failed', err instanceof Error ? err.message : '');
		} finally {
			busy = null;
		}
	}

	function doSave() {
		if (!dataset) return;
		busy = 'save';
		try {
			const thumbnail = buildThumbnail({
				kpis: kpiValues,
				chartTypes: project.visibleCharts.map((c) => c.type),
				colors: paletteColors(settings.current.palette, settings.isDark),
				dark: settings.isDark
			});
			const saved = project.save(name, thumbnail);
			toast.success(`"${saved.name}" saved`, 'Find it any time under My dashboards.');
		} catch (err) {
			if (err instanceof StorageError) toast.error(err.message, err.hint);
			else toast.error('Could not save the dashboard', err instanceof Error ? err.message : '');
		} finally {
			busy = null;
		}
	}

	async function copyShare() {
		if (!project.savedId) {
			toast.warning('Save the dashboard first', 'A share link points at a saved dashboard in this browser.');
			return;
		}
		try {
			await navigator.clipboard.writeText(shareUrl);
			shareCopied = true;
			setTimeout(() => (shareCopied = false), 2500);
			toast.success('Share link copied');
		} catch {
			toast.error('Could not reach the clipboard', 'Select the link below and copy it manually.');
		}
	}
</script>

<svelte:head><title>Export & share · DataStory</title></svelte:head>

{#if dataset && report}
	<div class="mx-auto max-w-3xl px-4 py-6 sm:px-6">
		<header class="mb-6">
			<h1 class="text-[22px] font-semibold tracking-tight text-ink">Export & share</h1>
			<p class="mt-1 text-[13.5px] text-muted">
				Everything is generated here in your browser, so nothing is uploaded to produce a file.
			</p>
		</header>

		<!-- dashboard name -->
		<div class="card mb-4 p-4">
			<label class="block">
				<span class="mb-1.5 block text-[11px] font-medium tracking-wide text-muted uppercase">
					Dashboard name
				</span>
				<input
					bind:value={name}
					placeholder={dataset.name}
					class="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint"
				/>
			</label>
			<p class="mt-2 text-[12px] text-faint">
				Used for the file names, the PDF title block and the My Dashboards list.
			</p>
		</div>

		<!-- what will be exported -->
		<div class="card mb-4 px-4 py-3.5">
			<p class="mb-2 text-[11px] font-semibold tracking-wide text-faint uppercase">
				What gets exported
			</p>
			<ul class="grid gap-x-6 gap-y-1.5 text-[12.5px] text-body sm:grid-cols-2">
				<li class="flex items-center gap-2">
					<Icon name="check" size={13} class="text-[var(--ds-positive)]" />
					{kpiValues.length} KPI card{kpiValues.length === 1 ? '' : 's'}
				</li>
				<li class="flex items-center gap-2">
					<Icon name="check" size={13} class="text-[var(--ds-positive)]" />
					{project.visibleCharts.length} chart{project.visibleCharts.length === 1 ? '' : 's'}
				</li>
				<li class="flex items-center gap-2">
					<Icon name="check" size={13} class="text-[var(--ds-positive)]" />
					{project.insights.length} written insight{project.insights.length === 1 ? '' : 's'}
				</li>
				<li class="flex items-center gap-2">
					<Icon name="check" size={13} class="text-[var(--ds-positive)]" />
					{project.rows.length.toLocaleString()} rows after filters
				</li>
			</ul>
			{#if project.filterSummary.length > 0}
				<div class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
					<span class="text-[11.5px] text-muted">Active filters:</span>
					{#each project.filterSummary as filter (filter)}
						<Badge size="sm" tone="accent">{filter}</Badge>
					{/each}
				</div>
			{/if}
		</div>

		<!-- export actions -->
		<div class="space-y-2.5">
			{#each [{ key: 'pdf', icon: 'file' as const, title: 'Export as PDF', body: 'A full report: title block, KPIs, every insight, the cleaning log, each chart as an image, and a column reference.', action: doPdf }, { key: 'png', icon: 'chart' as const, title: 'Export dashboard as PNG', body: 'One tall image of the KPI strip and every chart, at 2x resolution — ready to paste into a slide or a chat.', action: doPng }, { key: 'csv', icon: 'sheet' as const, title: 'Export cleaned data as CSV', body: `All ${dataset.rowCount.toLocaleString()} rows after cleaning, with dates in your chosen format and a UTF-8 BOM so Excel opens it correctly.`, action: doCsv }] as item (item.key)}
				<div class="card flex flex-wrap items-center gap-4 p-4">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
					>
						<Icon name={item.icon} size={19} />
					</div>
					<div class="min-w-[200px] flex-1">
						<h2 class="text-[14px] font-semibold text-ink">{item.title}</h2>
						<p class="mt-0.5 text-[12.5px] leading-relaxed text-muted">{item.body}</p>
					</div>
					<Button
						variant={item.key === 'pdf' ? 'primary' : 'secondary'}
						loading={busy === item.key}
						disabled={busy !== null && busy !== item.key}
						onclick={item.action}
					>
						<Icon name="download" size={15} /> Download
					</Button>
				</div>
			{/each}
		</div>

		{#if busy && progress}
			<p class="mt-3 flex items-center gap-2 text-[12.5px] text-muted">
				<span
					class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent"
				></span>
				{progress}
			</p>
		{/if}

		<!-- save + share -->
		<h2 class="mt-8 mb-3 text-[15px] font-semibold text-ink">Save & share</h2>

		<div class="card p-4">
			<div class="flex flex-wrap items-center gap-4">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
				>
					<Icon name="save" size={19} />
				</div>
				<div class="min-w-[200px] flex-1">
					<h3 class="text-[14px] font-semibold text-ink">
						{project.savedId ? 'Update saved dashboard' : 'Save to My Dashboards'}
					</h3>
					<p class="mt-0.5 text-[12.5px] leading-relaxed text-muted">
						Keeps the cleaned data, layout, filters and cleaning log in this browser so you can
						reopen it without the original file.
					</p>
				</div>
				<Button variant="primary" loading={busy === 'save'} onclick={doSave}>
					<Icon name="save" size={15} />
					{project.savedId ? 'Update' : 'Save'}
				</Button>
			</div>

			{#if !storageAvailable()}
				<p
					class="mt-3 flex items-start gap-2 rounded-lg bg-[var(--ds-caution-soft)] px-3 py-2 text-[12px] text-[var(--ds-caution)]"
				>
					<Icon name="alert" size={14} class="mt-0.5 shrink-0" />
					This browser is blocking local storage (private mode, or site data is disabled), so dashboards
					cannot be saved. Exports still work.
				</p>
			{/if}

			{#if project.savedId}
				<div class="mt-4 border-t border-line pt-4">
					<p class="mb-2 text-[11px] font-semibold tracking-wide text-faint uppercase">Share link</p>
					<div class="flex flex-wrap gap-2">
						<input
							readonly
							value={shareUrl}
							onclick={(e) => e.currentTarget.select()}
							class="h-10 min-w-[220px] flex-1 rounded-lg border border-line bg-raised px-3 font-mono text-[12px] text-body"
							aria-label="Share link"
						/>
						<Button onclick={copyShare}>
							<Icon name={shareCopied ? 'check' : 'link'} size={15} />
							{shareCopied ? 'Copied' : 'Copy link'}
						</Button>
					</div>
					<p class="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-muted">
						<Icon name="info" size={13} class="mt-0.5 shrink-0" />
						The link opens the dashboard in view-only mode — charts cannot be edited or removed.
						Because DataStory has no server, it only works in
						<span class="font-medium text-body">this browser on this device</span>. To hand the
						dashboard to someone else, send them the PDF or PNG.
					</p>
				</div>
			{/if}
		</div>

		<div class="mt-6 flex justify-between gap-2">
			<Button href={ROUTES.dashboard}>
				<Icon name="arrow-left" size={15} /> Back to dashboard
			</Button>
			<Button href={ROUTES.dashboards}>
				My dashboards <Icon name="arrow-right" size={15} />
			</Button>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-3xl space-y-3 px-4 py-6">
		<div class="skeleton h-8 w-48"></div>
		{#each Array(3) as _, i (i)}
			<div class="skeleton h-24"></div>
		{/each}
	</div>
{/if}
