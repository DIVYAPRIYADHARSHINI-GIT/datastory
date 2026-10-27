<script lang="ts">
	/** Help & FAQ, privacy note and the keyboard shortcut reference. */
	import { ROUTES } from '#lib/nav';
	import Icon from '#lib/components/Icon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { MAX_FILE_BYTES, MAX_ROWS, PREVIEW_ROWS } from '#lib/data/parse';
	import { formatBytes } from '#lib/format';

	const faqs = [
		{
			q: 'Where does my data go?',
			a: `Nowhere. DataStory is a static site with no server and no account. Your file is read by JavaScript in this tab, analysed in memory, and discarded when you close it. The only thing that persists is what you explicitly save, which goes into this browser's local storage on your own device.`
		},
		{
			q: 'What file formats work?',
			a: `CSV and TSV, plus Excel .xlsx, .xls and .xlsm. Files up to ${formatBytes(MAX_FILE_BYTES)} and ${MAX_ROWS.toLocaleString()} rows. If a workbook has several sheets, DataStory asks which one to analyse. Google Sheets works too — use File → Download → CSV first.`
		},
		{
			q: 'How does DataStory know what my columns are?',
			a: 'It samples up to 1,000 values spread across the whole column (not just the first rows) and scores how many parse as a number, a date or a yes/no value. A type needs at least 80% of the sample to win; otherwise the column stays text. Low-cardinality text becomes a "category" so it can be grouped. Identifier-looking columns like Order ID stay text, so nobody accidentally averages an invoice number.'
		},
		{
			q: 'The type on one of my columns is wrong. Can I change it?',
			a: 'Yes. On the data preview screen, every column header shows its detected type — click it to switch to number, category, text, date or yes/no. Charts and filters using that column are reset so nothing is left pointing at the old type.'
		},
		{
			q: 'How is the health score calculated?',
			a: 'It starts at 100 and deducts for problems in proportion to how much of the table they affect: up to 40 points for missing cells, 20 for duplicate rows, 10 for empty rows, 10 for outliers, 5 if there is stray whitespace, 5 for inconsistent date formats, and 5 per useless column (completely empty, or identical in every row), capped at 10. The data quality panel lists every deduction.'
		},
		{
			q: 'Which charts does it choose, and why?',
			a: 'A date column plus a measure becomes a trend line. A category with a handful of values becomes a donut for share and a bar for magnitude. A category with hundreds of values becomes a top-10 ranking instead of an unreadable bar chart. A measure gets a histogram. Two measures that move together get a scatter. Three or more numbers get a correlation heatmap. Every card shows its reason underneath the title.'
		},
		{
			q: 'How are the written insights generated?',
			a: 'From statistics, not a language model. Period-over-period change, share of total, Pareto concentration, Pearson correlation, Tukey outlier fences and mean-versus-median skew each produce a sentence with the real numbers in it. That means every insight is reproducible from your file and none of them are invented.'
		},
		{
			q: 'What does cross-filtering do?',
			a: 'Click any bar, slice or line point and the whole dashboard filters down to that value — every KPI, every other chart, and the Story panel. Click the same element again, or the chip in the filter bar, to clear it. The card that set the filter is outlined so you can see where it came from.'
		},
		{
			q: 'Can I send a dashboard to someone else?',
			a: `The share link opens the dashboard in view-only mode, but only on the device that saved it — there is no server to host it from, which is the same reason your data stays private. To hand a dashboard to someone else, export a PDF or PNG from the Export & share screen.`
		},
		{
			q: 'My file is huge. Will it freeze the browser?',
			a: `CSV files are read in 1 MB chunks so the browser keeps painting between them rather than freezing. The preview table only draws ${PREVIEW_ROWS} rows at a time and scatter plots sample down to 4,000 points, but charts and KPIs always aggregate across every row. Past ${MAX_ROWS.toLocaleString()} rows DataStory analyses the first ${MAX_ROWS.toLocaleString()} and tells you it did.`
		},
		{
			q: 'Something went wrong with my file. What now?',
			a: 'The error message names the cause and suggests a fix. The usual culprits are a password-protected workbook, a renamed file that is not really a spreadsheet, an empty sheet, or a sheet with only formatting. Re-saving as .xlsx or exporting to CSV from the original app clears up nearly all of them.'
		},
		{
			q: 'Does it work on a phone?',
			a: 'Yes, the layout adapts down to small screens, and charts resize. Building a dashboard is far more comfortable on a desktop though — drag-to-rearrange and the chart builder have more room there. Dragging cards also has a keyboard alternative (Alt + arrow keys).'
		}
	];

	const shortcuts = [
		{ keys: 'U', label: 'Upload a file' },
		{ keys: 'P', label: 'Data preview & cleaning' },
		{ keys: 'D', label: 'Dashboard' },
		{ keys: 'S', label: 'Story (insights)' },
		{ keys: 'B', label: 'Custom chart builder' },
		{ keys: 'C', label: 'Clear all filters' },
		{ keys: 'T', label: 'Toggle light / dark mode' },
		{ keys: '?', label: 'Show the shortcut list' },
		{ keys: 'Alt + ← / →', label: 'Move the focused dashboard card' },
		{ keys: 'Alt + ↑ / ↓', label: 'Make the focused card wider or narrower' },
		{ keys: 'Esc', label: 'Close a dialog or leave fullscreen' }
	];

	let openIndex = $state<number | null>(0);
</script>

<svelte:head><title>Help & FAQ · DataStory</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6 sm:px-6">
	<header class="mb-6">
		<h1 class="text-[22px] font-semibold tracking-tight text-ink">Help & FAQ</h1>
		<p class="mt-1 text-[13.5px] text-muted">
			How DataStory reads your file, chooses charts and writes insights.
		</p>
	</header>

	<!-- privacy -->
	<section id="privacy" class="card mb-6 p-5">
		<div class="flex items-start gap-3.5">
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
			>
				<Icon name="shield" size={20} />
			</div>
			<div>
				<h2 class="text-[15px] font-semibold text-ink">Your data never leaves your device</h2>
				<p class="mt-1.5 text-[13px] leading-relaxed text-body">
					DataStory ships as static files. There is no backend, no database, no analytics and no
					account. When you open a spreadsheet, the browser reads it from your disk into memory —
					nothing is transmitted. Cleaning, charting, insight generation, PDF and PNG rendering all
					happen in this tab. Saved dashboards go into this browser's local storage, which is also on
					your machine. Close the tab without saving and the data is simply gone.
				</p>
			</div>
		</div>
	</section>

	<!-- FAQ accordion -->
	<section class="mb-6">
		<h2 class="mb-3 text-[15px] font-semibold text-ink">Frequently asked</h2>
		<div class="space-y-1.5">
			{#each faqs as faq, i (faq.q)}
				<div class="card overflow-hidden">
					<button
						onclick={() => (openIndex = openIndex === i ? null : i)}
						class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-raised"
						aria-expanded={openIndex === i}
					>
						<span class="flex-1 text-[13.5px] font-medium text-ink">{faq.q}</span>
						<Icon
							name="chevron-down"
							size={16}
							class="shrink-0 text-muted transition-transform {openIndex === i ? 'rotate-180' : ''}"
						/>
					</button>
					{#if openIndex === i}
						<div class="border-t border-line px-4 py-3">
							<p class="text-[13px] leading-relaxed text-body">{faq.a}</p>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<!-- shortcuts -->
	<section id="shortcuts" class="card mb-6 p-5">
		<h2 class="mb-1 text-[15px] font-semibold text-ink">Keyboard shortcuts</h2>
		<p class="mb-4 text-[12.5px] text-muted">
			Single keys work anywhere except while typing in a field.
		</p>
		<ul class="space-y-1.5">
			{#each shortcuts as shortcut (shortcut.keys)}
				<li class="flex items-center justify-between gap-4 text-[13px]">
					<span class="text-body">{shortcut.label}</span>
					<kbd
						class="shrink-0 rounded border border-line bg-raised px-2 py-0.5 font-mono text-[11px] text-ink"
					>
						{shortcut.keys}
					</kbd>
				</li>
			{/each}
		</ul>
	</section>

	<!-- glossary -->
	<section class="card mb-6 p-5">
		<h2 class="mb-3 text-[15px] font-semibold text-ink">A few terms, briefly</h2>
		<dl class="space-y-3 text-[13px]">
			{#each [{ t: 'Measure', d: 'A number column that is safe to total or average — revenue, marks, hours. Identifier-shaped numbers are excluded.' }, { t: 'Dimension', d: 'A column you group by: region, department, plan. DataStory treats category columns with 2–40 distinct values as dimensions.' }, { t: 'Correlation (r)', d: 'How tightly two numbers move together, from −1 to +1. Above 0.7 is strong. It never proves causation.' }, { t: 'Outlier', d: 'A value more than 1.5× the interquartile range beyond the middle 50%. Often a typo, sometimes a genuine extreme.' }, { t: 'Median vs mean', d: 'The median is the middle value and ignores extremes; the mean is the average and does not. When they differ a lot, the data is skewed.' }, { t: 'Cross-filter', d: 'Clicking a chart element to filter every other card on the dashboard by that value.' }] as item (item.t)}
				<div>
					<dt class="font-semibold text-ink">{item.t}</dt>
					<dd class="mt-0.5 leading-relaxed text-body">{item.d}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<div class="flex flex-wrap gap-2">
		<Button variant="primary" href={ROUTES.upload}>
			<Icon name="upload" size={15} /> Upload a file
		</Button>
		<Button href="{ROUTES.upload}?sample=sales">Try a sample dataset</Button>
		<Button href={ROUTES.home}>Back to the home page</Button>
	</div>
</div>
