<script lang="ts">
	/** Landing page: hero, 3-step explainer, feature highlights, dashboard preview, footer. */
	import { ROUTES } from '#lib/nav';
	import { goto } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import DashboardPreview from '#lib/components/DashboardPreview.svelte';
	import { settings } from '#lib/stores/settings.svelte';
	import { SAMPLES } from '#lib/data/samples';

	const steps = [
		{
			icon: 'upload' as const,
			title: 'Upload',
			body: 'Drop in a CSV or Excel file, or start from one of four built-in datasets. Nothing is uploaded anywhere — the file is read by your browser.'
		},
		{
			icon: 'spark' as const,
			title: 'Auto-analyze',
			body: 'DataStory detects column types, scores data quality, cleans duplicates and gaps in one click, then picks the charts that actually suit your columns.'
		},
		{
			icon: 'share' as const,
			title: 'Share',
			body: 'Filter, cross-filter and rearrange the dashboard, read the written story behind the numbers, then export to PDF, PNG or clean CSV.'
		}
	];

	const features = [
		{
			icon: 'shield' as const,
			title: 'Private by design',
			body: 'There is no server and no account. Your spreadsheet is parsed in this tab and stays on your device, so confidential data never travels.'
		},
		{
			icon: 'broom' as const,
			title: 'Cleaning that explains itself',
			body: 'Missing values, duplicates, stray spaces, mixed date formats and outliers are each listed with a count, a fix, and a before/after health score.'
		},
		{
			icon: 'chart' as const,
			title: 'Charts chosen for your columns',
			body: 'A date column becomes a trend. Low-cardinality text becomes a comparison. Long tails become a top-10. Every card says why it was picked.'
		},
		{
			icon: 'story' as const,
			title: 'Insights in plain English',
			body: '"West contributes 38% of total revenue." "Revenue fell 41% in March." Each insight links to the chart that proves it.'
		},
		{
			icon: 'filter' as const,
			title: 'Filters that hit everything',
			body: 'Date ranges, category pickers and numeric sliders update every KPI and chart instantly. Click any bar or slice to cross-filter the whole page.'
		},
		{
			icon: 'builder' as const,
			title: 'Build your own',
			body: 'Pick an axis, a measure, an aggregation and a chart type, preview it live, then add it to the dashboard with one click.'
		}
	];
</script>

<svelte:head>
	<title>DataStory — turn any spreadsheet into a story</title>
	<meta
		name="description"
		content="Upload a CSV or Excel file and get KPI cards, charts and written insights in under a minute. Everything runs in your browser — your data never leaves your device."
	/>
</svelte:head>

<div class="min-h-full">
	<!-- ------------------------------- header ------------------------------- -->
	<header class="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--ds-surface)_86%,transparent)] backdrop-blur-md">
		<div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
			<Logo size={26} />
			<div class="flex items-center gap-1">
				<a
					href={ROUTES.help}
					class="hidden h-9 items-center rounded-lg px-3 text-[13px] font-medium text-body transition-colors hover:bg-raised hover:text-ink sm:flex"
				>
					Help
				</a>
				<a
					href={ROUTES.dashboards}
					class="hidden h-9 items-center rounded-lg px-3 text-[13px] font-medium text-body transition-colors hover:bg-raised hover:text-ink sm:flex"
				>
					My dashboards
				</a>
				<button
					onclick={() => settings.toggleTheme()}
					class="flex h-9 w-9 items-center justify-center rounded-lg text-body transition-colors hover:bg-raised hover:text-ink"
					aria-label={settings.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
				>
					<Icon name={settings.isDark ? 'sun' : 'moon'} size={17} />
				</button>
				<Button href={ROUTES.upload} variant="primary" size="sm" class="ml-1">
					Upload a file
				</Button>
			</div>
		</div>
	</header>

	<!-- -------------------------------- hero -------------------------------- -->
	<section class="relative overflow-hidden px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
		<!-- Soft accent glow, kept subtle so the base stays neutral -->
		<div
			class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] opacity-[0.07]"
			style="background: radial-gradient(60% 60% at 50% 0%, var(--ds-accent), transparent 70%)"
			aria-hidden="true"
		></div>

		<div class="mx-auto max-w-3xl text-center">
			<span
				class="mb-5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-muted"
			>
				<Icon name="shield" size={13} class="text-accent" />
				Runs entirely in your browser
			</span>

			<h1 class="text-[34px] leading-[1.08] font-semibold tracking-tight text-balance text-ink sm:text-[52px]">
				Turn any spreadsheet into a story.
			</h1>

			<p class="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-balance text-body sm:text-[17px]">
				Upload a CSV or Excel file. DataStory cleans it, works out what each column is, and builds a
				dashboard of KPIs, charts and written insights — in under a minute, without a single formula.
			</p>

			<div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
				<Button href={ROUTES.upload} variant="primary" size="lg">
					<Icon name="upload" size={17} /> Upload a file
				</Button>
				<Button
					size="lg"
					onclick={() => goto(`${ROUTES.upload}?sample=sales`)}
				>
					<Icon name="spark" size={17} /> Try a sample dataset
				</Button>
			</div>

			<p class="mt-4 text-[12.5px] text-faint">
				.csv, .xlsx and .xls up to 50 MB · no account, no upload, no tracking
			</p>
		</div>

		<!-- ---------------------- sample dashboard preview ---------------------- -->
		<div class="mx-auto mt-14 max-w-6xl">
			<div class="card overflow-hidden p-2 shadow-[var(--shadow-lift)] sm:p-3">
				<DashboardPreview />
			</div>
			<p class="mt-3 text-center text-[12px] text-faint">
				A real DataStory dashboard, generated from the built-in Retail Sales dataset.
			</p>
		</div>
	</section>

	<!-- ----------------------------- how it works --------------------------- -->
	<section class="border-t border-line px-4 py-16 sm:px-6">
		<div class="mx-auto max-w-6xl">
			<h2 class="text-center text-[26px] font-semibold tracking-tight text-ink sm:text-[32px]">
				Three steps, about a minute
			</h2>
			<p class="mx-auto mt-3 max-w-xl text-center text-[14.5px] text-muted">
				No modelling, no measures, no DAX. Open the file and read the answer.
			</p>

			<ol class="mt-10 grid gap-4 md:grid-cols-3">
				{#each steps as step, i (step.title)}
					<li class="card relative p-5">
						<span
							class="absolute top-5 right-5 font-mono text-[32px] leading-none font-semibold text-line"
							aria-hidden="true">{i + 1}</span
						>
						<div
							class="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent"
						>
							<Icon name={step.icon} size={20} />
						</div>
						<h3 class="text-[15px] font-semibold text-ink">{step.title}</h3>
						<p class="mt-1.5 text-[13.5px] leading-relaxed text-muted">{step.body}</p>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<!-- ------------------------------ features ------------------------------ -->
	<section class="border-t border-line bg-surface px-4 py-16 sm:px-6">
		<div class="mx-auto max-w-6xl">
			<h2 class="text-[26px] font-semibold tracking-tight text-ink sm:text-[32px]">
				Built like a BI tool, not a template
			</h2>
			<p class="mt-3 max-w-xl text-[14.5px] text-muted">
				Everything below is generated from your columns — none of it is hard-coded for a demo dataset.
			</p>

			<div class="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
				{#each features as feature (feature.title)}
					<div>
						<div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
							<Icon name={feature.icon} size={18} />
						</div>
						<h3 class="text-[14.5px] font-semibold text-ink">{feature.title}</h3>
						<p class="mt-1.5 text-[13.5px] leading-relaxed text-muted">{feature.body}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ------------------------------- samples ------------------------------ -->
	<section class="border-t border-line px-4 py-16 sm:px-6">
		<div class="mx-auto max-w-6xl">
			<h2 class="text-[26px] font-semibold tracking-tight text-ink sm:text-[32px]">
				Nothing to upload? Start with one of these
			</h2>
			<p class="mt-3 max-w-xl text-[14.5px] text-muted">
				Four realistic datasets, each with its own quality problems to clean.
			</p>

			<div class="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{#each SAMPLES as sample (sample.id)}
					<a
						href="{ROUTES.upload}?sample={sample.id}"
						class="card group flex flex-col gap-2 p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-lift)]"
					>
						<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
							<Icon name={sample.icon} size={18} />
						</div>
						<h3 class="text-[14px] font-semibold text-ink">{sample.name}</h3>
						<p class="text-[12px] text-faint">
							{sample.rows.toLocaleString()} rows · {sample.columns} columns
						</p>
						<p class="text-[12.5px] leading-relaxed text-muted">{sample.description}</p>
						<span class="mt-auto flex items-center gap-1 pt-2 text-[12.5px] font-medium text-accent">
							Open dashboard
							<Icon name="arrow-right" size={13} class="transition-transform group-hover:translate-x-0.5" />
						</span>
					</a>
				{/each}
			</div>
		</div>
	</section>

	<!-- --------------------------------- CTA -------------------------------- -->
	<section class="border-t border-line px-4 py-16 sm:px-6">
		<div class="card mx-auto max-w-3xl px-6 py-10 text-center sm:px-10">
			<h2 class="text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">
				Your spreadsheet already has the answer.
			</h2>
			<p class="mx-auto mt-3 max-w-lg text-[14.5px] text-muted">
				DataStory just finds it, charts it, and writes it down.
			</p>
			<div class="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
				<Button href={ROUTES.upload} variant="primary" size="lg">
					<Icon name="upload" size={17} /> Upload a file
				</Button>
				<Button href="{ROUTES.upload}?sample=churn" size="lg">Try customer churn data</Button>
			</div>
		</div>
	</section>

	<!-- -------------------------------- footer ------------------------------ -->
	<footer class="border-t border-line px-4 py-10 sm:px-6">
		<div class="mx-auto max-w-6xl">
			<div class="flex flex-col justify-between gap-8 md:flex-row">
				<div class="max-w-xs">
					<Logo size={26} />
					<p class="mt-3 text-[13px] leading-relaxed text-muted">
						A data-to-dashboard tool for people who have spreadsheets but no time to build reports.
					</p>
				</div>

				<div class="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3 md:max-w-lg">
					<div>
						<h3 class="mb-2.5 text-[11px] font-semibold tracking-wide text-faint uppercase">Product</h3>
						<ul class="space-y-1.5 text-[13px]">
							<li><a href={ROUTES.upload} class="text-muted transition-colors hover:text-ink">Upload</a></li>
							<li><a href={ROUTES.dashboards} class="text-muted transition-colors hover:text-ink">My dashboards</a></li>
							<li><a href={ROUTES.settings} class="text-muted transition-colors hover:text-ink">Settings</a></li>
						</ul>
					</div>
					<div>
						<h3 class="mb-2.5 text-[11px] font-semibold tracking-wide text-faint uppercase">Samples</h3>
						<ul class="space-y-1.5 text-[13px]">
							{#each SAMPLES as sample (sample.id)}
								<li>
									<a href="{ROUTES.upload}?sample={sample.id}" class="text-muted transition-colors hover:text-ink">
										{sample.name}
									</a>
								</li>
							{/each}
						</ul>
					</div>
					<div>
						<h3 class="mb-2.5 text-[11px] font-semibold tracking-wide text-faint uppercase">Learn</h3>
						<ul class="space-y-1.5 text-[13px]">
							<li><a href={ROUTES.help} class="text-muted transition-colors hover:text-ink">Help & FAQ</a></li>
							<li><a href="{ROUTES.help}#shortcuts" class="text-muted transition-colors hover:text-ink">Keyboard shortcuts</a></li>
							<li><a href="{ROUTES.help}#privacy" class="text-muted transition-colors hover:text-ink">Privacy</a></li>
						</ul>
					</div>
				</div>
			</div>

			<div
				class="mt-8 flex flex-col items-start justify-between gap-2 border-t border-line pt-6 text-[12px] text-faint sm:flex-row sm:items-center"
			>
				<p class="flex items-center gap-1.5">
					<Icon name="shield" size={13} />
					Your data never leaves your device.
				</p>
				<p>Built with SvelteKit, ECharts, PapaParse and SheetJS.</p>
			</div>
		</div>
	</footer>
</div>
