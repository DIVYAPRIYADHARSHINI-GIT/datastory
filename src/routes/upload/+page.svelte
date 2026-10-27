<script lang="ts">
	/**
	 * Upload screen.
	 * Drag-and-drop + browse, Excel sheet selection, validation errors with a fix hint,
	 * and the four built-in sample datasets. `?sample=<id>` loads a sample immediately,
	 * which is how the landing page's "Try a sample dataset" button works.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ROUTES } from '#lib/nav';
	import { page } from '$app/state';
	import { project } from '#lib/stores/project.svelte';
	import {
		ACCEPTED_EXTENSIONS,
		MAX_FILE_BYTES,
		ParseError,
		isExcel,
		openWorkbook,
		parseCsvFile,
		validateFile,
		type Workbook
	} from '#lib/data/parse';
	import { buildDataset } from '#lib/analysis/stats';
	import { SAMPLES, loadSample, type SampleId } from '#lib/data/samples';
	import { formatBytes } from '#lib/format';
	import Icon from '#lib/components/Icon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';

	let dragging = $state(false);
	let busy = $state(false);
	let busyLabel = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);

	// Excel sheet selection state - set after a workbook is opened.
	let workbook = $state<Workbook | null>(null);
	let workbookName = $state('');
	let sheetNames = $state<string[]>([]);
	let chosenSheet = $state('');

	let failure = $state<{ message: string; hint: string } | null>(null);

	onMount(() => {
		const sample = page.url.searchParams.get('sample');
		if (sample && SAMPLES.some((s) => s.id === sample)) {
			void startSample(sample as SampleId);
		}
	});

	/** Shared completion path for every import route. */
	function finish(name: string) {
		busy = false;
		busyLabel = '';
		toast.success(`${name} is ready`, 'Check the detected column types, then open the dashboard.');
		void goto(ROUTES.preview);
	}

	function handleFailure(err: unknown) {
		busy = false;
		busyLabel = '';
		if (err instanceof ParseError) {
			failure = { message: err.message, hint: err.hint };
		} else {
			failure = {
				message: err instanceof Error ? err.message : 'Something went wrong reading that file.',
				hint: 'Try re-saving the file as CSV, or pick a different file.'
			};
		}
		project.fail(failure.message, failure.hint);
	}

	async function handleFile(file: File) {
		failure = null;
		workbook = null;
		sheetNames = [];
		try {
			validateFile(file);
		} catch (err) {
			handleFailure(err);
			return;
		}

		busy = true;
		project.startParsing(`Reading ${file.name}…`);

		try {
			if (isExcel(file.name)) {
				busyLabel = 'Opening the workbook…';
				const wb = await openWorkbook(file);
				// More than one sheet: let the user choose before analysing.
				if (wb.sheetNames.length > 1) {
					workbook = wb;
					workbookName = file.name;
					sheetNames = wb.sheetNames;
					chosenSheet = wb.sheetNames[0];
					busy = false;
					busyLabel = '';
					project.stage = 'empty';
					return;
				}
				await readSheet(wb, wb.sheetNames[0], file.name);
				return;
			}

			busyLabel = 'Parsing rows…';
			const outcome = await parseCsvFile(file);
			busyLabel = 'Detecting column types…';
			// Yield once so the skeleton paints before the synchronous type pass.
			await new Promise((r) => setTimeout(r, 0));
			const dataset = buildDataset(outcome.table, {
				name: file.name.replace(/\.[^.]+$/, ''),
				source: 'upload'
			});
			project.load(dataset, { warnings: outcome.warnings, truncated: outcome.truncated });
			finish(dataset.name);
		} catch (err) {
			handleFailure(err);
		}
	}

	async function readSheet(wb: Workbook, sheet: string, fileName: string) {
		busy = true;
		busyLabel = `Reading sheet "${sheet}"…`;
		try {
			const outcome = wb.read(sheet);
			busyLabel = 'Detecting column types…';
			await new Promise((r) => setTimeout(r, 0));
			const dataset = buildDataset(outcome.table, {
				name: `${fileName.replace(/\.[^.]+$/, '')} — ${sheet}`,
				source: 'upload',
				sheet
			});
			project.load(dataset, { warnings: outcome.warnings, truncated: outcome.truncated });
			finish(dataset.name);
		} catch (err) {
			handleFailure(err);
		}
	}

	async function startSample(id: SampleId) {
		failure = null;
		busy = true;
		busyLabel = 'Loading the sample dataset…';
		project.startParsing('Loading the sample dataset…');
		try {
			const dataset = await loadSample(id);
			project.load(dataset);
			finish(dataset.name);
		} catch (err) {
			handleFailure(err);
		}
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) void handleFile(file);
	}

	function onPick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void handleFile(file);
		input.value = '';
	}
</script>

<svelte:head><title>Upload a file · DataStory</title></svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
	<header class="mb-7">
		<h1 class="text-[26px] font-semibold tracking-tight text-ink sm:text-[30px]">
			Upload your spreadsheet
		</h1>
		<p class="mt-2 text-[14.5px] text-muted">
			CSV or Excel, up to {formatBytes(MAX_FILE_BYTES)}. The file is read here in your browser — it is
			never sent anywhere.
		</p>
	</header>

	{#if busy}
		<!-- Skeleton loader: the "analyzing" state -->
		<div class="card p-6">
			<div class="mb-5 flex items-center gap-3">
				<span
					class="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent"
				></span>
				<div>
					<p class="text-sm font-medium text-ink">{busyLabel || 'Working…'}</p>
					<p class="text-[12.5px] text-muted">
						Large files are read in chunks so the page stays responsive.
					</p>
				</div>
			</div>
			<div class="space-y-2.5">
				<div class="grid grid-cols-4 gap-2.5">
					{#each Array(4) as _, i (i)}
						<div class="skeleton h-16"></div>
					{/each}
				</div>
				<div class="skeleton h-40"></div>
				<div class="grid grid-cols-2 gap-2.5">
					<div class="skeleton h-28"></div>
					<div class="skeleton h-28"></div>
				</div>
			</div>
		</div>
	{:else if sheetNames.length > 1 && workbook}
		<!-- Excel sheet selector -->
		<div class="card p-5 sm:p-6">
			<div class="mb-4 flex items-start gap-3">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
					<Icon name="sheet" size={20} />
				</div>
				<div class="min-w-0">
					<h2 class="text-[15px] font-semibold text-ink">Which sheet should DataStory analyse?</h2>
					<p class="mt-0.5 truncate text-[13px] text-muted">
						{workbookName} contains {sheetNames.length} sheets with data.
					</p>
				</div>
			</div>

			<div class="space-y-1.5">
				{#each sheetNames as sheet (sheet)}
					<label
						class="flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors {chosenSheet ===
						sheet
							? 'border-accent bg-accent-soft'
							: 'border-line hover:border-line-strong hover:bg-raised'}"
					>
						<input
							type="radio"
							name="sheet"
							value={sheet}
							bind:group={chosenSheet}
							class="accent-[var(--ds-accent)]"
						/>
						<span class="flex-1 truncate text-sm font-medium text-ink">{sheet}</span>
						{#if sheet === sheetNames[0]}
							<Badge size="sm">First sheet</Badge>
						{/if}
					</label>
				{/each}
			</div>

			<div class="mt-5 flex gap-2">
				<Button
					variant="primary"
					onclick={() => workbook && readSheet(workbook, chosenSheet, workbookName)}
				>
					Analyse this sheet <Icon name="arrow-right" size={15} />
				</Button>
				<Button
					onclick={() => {
						workbook = null;
						sheetNames = [];
					}}
				>
					Choose a different file
				</Button>
			</div>
		</div>
	{:else}
		<!-- Drop zone -->
		<div
			role="button"
			tabindex="0"
			aria-label="Drop a CSV or Excel file here, or press Enter to browse"
			ondragover={(e) => {
				e.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={onDrop}
			onclick={() => fileInput?.click()}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					fileInput?.click();
				}
			}}
			class="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-14 text-center transition-all {dragging
				? 'scale-[1.01] border-accent bg-accent-soft'
				: 'border-line bg-surface hover:border-line-strong hover:bg-raised'}"
		>
			<div
				class="flex h-14 w-14 items-center justify-center rounded-2xl transition-colors {dragging
					? 'bg-accent text-[var(--ds-accent-ink)]'
					: 'bg-accent-soft text-accent'}"
			>
				<Icon name="upload" size={26} />
			</div>
			<p class="text-[15px] font-semibold text-ink">
				{dragging ? 'Drop it here' : 'Drag and drop your file'}
			</p>
			<p class="text-[13px] text-muted">
				or <span class="font-medium text-accent underline underline-offset-2">browse your files</span>
			</p>
			<p class="mt-1 text-[12px] text-faint">
				{ACCEPTED_EXTENSIONS.join(' · ')} — up to {formatBytes(MAX_FILE_BYTES)}
			</p>
			<input
				bind:this={fileInput}
				type="file"
				accept={ACCEPTED_EXTENSIONS.join(',')}
				onchange={onPick}
				class="hidden"
			/>
		</div>

		{#if failure}
			<div
				class="rise mt-4 flex items-start gap-3 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--ds-critical)_32%,transparent)] bg-[var(--ds-critical-soft)] px-4 py-3.5"
				role="alert"
			>
				<Icon name="alert" size={18} class="mt-0.5 shrink-0 text-[var(--ds-critical)]" />
				<div class="min-w-0 flex-1">
					<p class="text-[13.5px] font-semibold text-[var(--ds-critical)]">{failure.message}</p>
					{#if failure.hint}
						<p class="mt-1 text-[13px] leading-relaxed text-body">{failure.hint}</p>
					{/if}
				</div>
				<button
					onclick={() => (failure = null)}
					class="shrink-0 rounded p-1 text-muted hover:text-ink"
					aria-label="Dismiss"
				>
					<Icon name="x" size={15} />
				</button>
			</div>
		{/if}

		<!-- Privacy note -->
		<div class="mt-4 flex items-start gap-2.5 rounded-lg bg-raised px-4 py-3">
			<Icon name="shield" size={16} class="mt-0.5 shrink-0 text-accent" />
			<p class="text-[12.5px] leading-relaxed text-muted">
				<span class="font-medium text-body">Your data never leaves your device.</span>
				DataStory has no server and no account. Parsing, cleaning, charting and insight generation all
				happen inside this browser tab, and saved dashboards are stored in this browser's local storage.
			</p>
		</div>

		<!-- Samples -->
		<section class="mt-10">
			<h2 class="text-[17px] font-semibold text-ink">Or start with a sample dataset</h2>
			<p class="mt-1.5 text-[13.5px] text-muted">
				Each one is realistic and deliberately imperfect, so the cleaning tools have something to fix.
			</p>

			<div class="mt-4 grid gap-3 sm:grid-cols-2">
				{#each SAMPLES as sample (sample.id)}
					<button
						onclick={() => startSample(sample.id)}
						class="card group flex gap-3.5 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-lift)]"
					>
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
						>
							<Icon name={sample.icon} size={19} />
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline justify-between gap-2">
								<h3 class="text-[14px] font-semibold text-ink">{sample.name}</h3>
								<span class="shrink-0 text-[11px] text-faint">{sample.tagline}</span>
							</div>
							<p class="mt-1 text-[12.5px] leading-relaxed text-muted">{sample.description}</p>
							<ul class="mt-2 flex flex-wrap gap-1">
								{#each sample.highlights as highlight (highlight)}
									<li>
										<Badge size="sm">{highlight}</Badge>
									</li>
								{/each}
							</ul>
						</div>
					</button>
				{/each}
			</div>
		</section>
	{/if}
</div>
