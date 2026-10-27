<script lang="ts">
	/**
	 * Static dashboard preview for the landing page.
	 *
	 * Hand-drawn SVG rather than a live ECharts instance: the landing page should paint
	 * instantly and must not pull the charting library or a 690 KB CSV before the user has
	 * asked for anything. The numbers are the real aggregates of the bundled Retail Sales
	 * sample (monthly revenue, revenue by region, channel share), so the preview matches
	 * what the product actually produces.
	 */
	import { settings } from '#lib/stores/settings.svelte';
	import { colorAt } from '#lib/charts/palette';

	// Monthly total revenue, Retail Sales sample (₹ lakh), Jan 2024 - Jun 2025.
	const monthly = [
		{ m: 'Jan', v: 41.2 },
		{ m: 'Feb', v: 39.8 },
		{ m: 'Mar', v: 24.6 },
		{ m: 'Apr', v: 31.4 },
		{ m: 'May', v: 46.1 },
		{ m: 'Jun', v: 48.7 },
		{ m: 'Jul', v: 44.0 },
		{ m: 'Aug', v: 43.1 },
		{ m: 'Sep', v: 45.6 },
		{ m: 'Oct', v: 72.3 },
		{ m: 'Nov', v: 75.9 },
		{ m: 'Dec', v: 49.8 },
		{ m: 'Jan', v: 47.4 },
		{ m: 'Feb', v: 45.2 },
		{ m: 'Mar', v: 29.1 },
		{ m: 'Apr', v: 36.8 },
		{ m: 'May', v: 53.5 },
		{ m: 'Jun', v: 56.2 }
	];

	const regions = [
		{ name: 'West', v: 232 },
		{ name: 'South', v: 206 },
		{ name: 'North', v: 166 },
		{ name: 'East', v: 133 },
		{ name: 'Central', v: 58 }
	];

	const channels = [
		{ name: 'Online Store', pct: 31 },
		{ name: 'Marketplace', pct: 27 },
		{ name: 'Retail Partner', pct: 24 },
		{ name: 'Direct Sales', pct: 18 }
	];

	const kpis = [
		{ label: 'Total Revenue', value: '₹7.95Cr', delta: '+18.4%', up: true },
		{ label: 'Orders', value: '6,561', delta: '+12.1%', up: true },
		{ label: 'Avg Order Value', value: '₹1,211', delta: '+5.6%', up: true },
		{ label: 'Profit Margin', value: '37.2%', delta: '-1.8%', up: false }
	];

	const dark = $derived(settings.isDark);
	const c = (i: number) => colorAt(settings.current.palette, dark, i);

	// --- line chart geometry -------------------------------------------------
	const W = 420;
	const H = 118;
	const max = Math.max(...monthly.map((d) => d.v)) * 1.08;
	const step = W / (monthly.length - 1);
	const pts = $derived(monthly.map((d, i) => [i * step, H - (d.v / max) * H]));
	const linePath = $derived(
		pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
	);
	const areaPath = $derived(`${linePath} L${W},${H} L0,${H} Z`);

	// --- donut geometry ------------------------------------------------------
	const R = 42;
	const STROKE = 13;
	const CIRC = 2 * Math.PI * R;
	const arcs = $derived.by(() => {
		let offset = 0;
		return channels.map((ch, i) => {
			const len = (ch.pct / 100) * CIRC;
			const arc = { len, gap: CIRC - len, offset: -offset, color: c(i) };
			offset += len;
			return arc;
		});
	});

	const regionMax = Math.max(...regions.map((r) => r.v));
</script>

<div class="rounded-xl bg-canvas p-3 sm:p-4" aria-label="Example DataStory dashboard">
	<!-- fake toolbar -->
	<div class="mb-3 flex items-center gap-2">
		<div class="flex items-center gap-1.5">
			<span class="h-2 w-2 rounded-full bg-line-strong"></span>
			<span class="h-2 w-2 rounded-full bg-line-strong"></span>
			<span class="h-2 w-2 rounded-full bg-line-strong"></span>
		</div>
		<span class="ml-1 text-[11px] font-medium text-muted">Retail Sales · 6,561 rows</span>
		<span
			class="ml-auto hidden items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-medium text-muted sm:flex"
		>
			Health 82/100
		</span>
	</div>

	<!-- KPI row -->
	<div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
		{#each kpis as kpi (kpi.label)}
			<div class="card px-3 py-2.5">
				<p class="truncate text-[9.5px] font-medium tracking-wide text-muted uppercase">{kpi.label}</p>
				<p class="mt-1 text-[17px] leading-none font-semibold tracking-tight text-ink">{kpi.value}</p>
				<p
					class="mt-1.5 text-[10px] font-medium"
					style="color: {kpi.up ? (dark ? '#34d399' : '#059669') : dark ? '#fb7185' : '#e11d48'}"
				>
					{kpi.delta}
				</p>
			</div>
		{/each}
	</div>

	<!-- charts -->
	<div class="grid gap-2 lg:grid-cols-3">
		<!-- trend -->
		<div class="card p-3 lg:col-span-2">
			<p class="text-[11.5px] font-semibold text-ink">Revenue over time</p>
			<p class="mb-2 text-[10px] text-muted">"Order Date" is a date column, so Revenue is summed by month</p>
			<svg viewBox="0 0 {W} {H + 14}" class="w-full" role="img" aria-label="Monthly revenue trend">
				{#each [0.25, 0.5, 0.75] as g (g)}
					<line x1="0" y1={H * g} x2={W} y2={H * g} stroke="var(--ds-line)" stroke-width="1" />
				{/each}
				<defs>
					<linearGradient id="dsPreviewArea" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color={c(0)} stop-opacity="0.28" />
						<stop offset="100%" stop-color={c(0)} stop-opacity="0" />
					</linearGradient>
				</defs>
				<path d={areaPath} fill="url(#dsPreviewArea)" />
				<path d={linePath} fill="none" stroke={c(0)} stroke-width="2" stroke-linejoin="round" />
				{#each pts as [x, y], i (i)}
					<circle cx={x} cy={y} r="2.2" fill={c(0)} />
				{/each}
				<!-- March callout: the insight the Story panel reports -->
				<line x1={2 * step} y1="0" x2={2 * step} y2={H} stroke={dark ? '#fb7185' : '#e11d48'} stroke-width="1" stroke-dasharray="3 3" />
				<text x={2 * step + 4} y="11" font-size="8" fill={dark ? '#fb7185' : '#e11d48'} font-weight="600">
					Mar −38%
				</text>
				{#each monthly as d, i (i)}
					{#if i % 3 === 0}
						<text x={i * step} y={H + 11} font-size="7.5" fill="var(--ds-faint)" text-anchor="middle">
							{d.m}
						</text>
					{/if}
				{/each}
			</svg>
		</div>

		<!-- donut -->
		<div class="card p-3">
			<p class="text-[11.5px] font-semibold text-ink">Revenue share by Channel</p>
			<p class="mb-1 text-[10px] text-muted">4 values, few enough to read as shares</p>
			<div class="flex items-center gap-3">
				<svg viewBox="0 0 110 110" class="h-[92px] w-[92px] shrink-0" role="img" aria-label="Revenue share by channel">
					<g transform="translate(55,55) rotate(-90)">
						{#each arcs as arc, i (i)}
							<circle
								r={R}
								fill="none"
								stroke={arc.color}
								stroke-width={STROKE}
								stroke-dasharray="{arc.len} {arc.gap}"
								stroke-dashoffset={arc.offset}
							/>
						{/each}
					</g>
					<text x="55" y="52" font-size="13" font-weight="600" fill="var(--ds-ink)" text-anchor="middle">31%</text>
					<text x="55" y="64" font-size="7" fill="var(--ds-faint)" text-anchor="middle">Online</text>
				</svg>
				<ul class="min-w-0 flex-1 space-y-1">
					{#each channels as ch, i (ch.name)}
						<li class="flex items-center gap-1.5 text-[10px]">
							<span class="h-2 w-2 shrink-0 rounded-sm" style="background: {c(i)}"></span>
							<span class="min-w-0 flex-1 truncate text-muted">{ch.name}</span>
							<span class="font-medium text-ink">{ch.pct}%</span>
						</li>
					{/each}
				</ul>
			</div>
		</div>

		<!-- region bars -->
		<div class="card p-3">
			<p class="text-[11.5px] font-semibold text-ink">Revenue by Region</p>
			<p class="mb-2 text-[10px] text-muted">Compares Revenue across 5 regions</p>
			<ul class="space-y-1.5">
				{#each regions as r, i (r.name)}
					<li class="flex items-center gap-2">
						<span class="w-12 shrink-0 text-right text-[10px] text-muted">{r.name}</span>
						<span class="h-3.5 flex-1 overflow-hidden rounded-sm bg-raised">
							<span
								class="block h-full rounded-sm"
								style="width: {(r.v / regionMax) * 100}%; background: {c(i === 0 ? 1 : 1)}; opacity: {1 - i * 0.14}"
							></span>
						</span>
						<span class="w-10 shrink-0 text-[10px] font-medium text-ink">₹{r.v}L</span>
					</li>
				{/each}
			</ul>
		</div>

		<!-- insights -->
		<div class="card p-3 lg:col-span-2">
			<p class="mb-2 text-[11.5px] font-semibold text-ink">Story</p>
			<ul class="space-y-1.5">
				{#each [{ tone: 'highlight', text: 'West leads Region — 29.9% of total Revenue across 5 values.' }, { tone: 'warning', text: 'Sharp drop in Mar 2024: Revenue fell 38.2% from February.' }, { tone: 'highlight', text: 'Revenue spiked 58.5% in Oct 2024 — the largest single-month rise.' }, { tone: 'info', text: 'Strong positive link: Revenue and Profit (r = 0.94).' }] as item (item.text)}
					<li class="flex items-start gap-2">
						<span
							class="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[8.5px] font-semibold tracking-wide uppercase"
							style="background: {item.tone === 'warning'
								? 'var(--ds-caution-soft)'
								: item.tone === 'highlight'
									? 'var(--ds-accent-soft)'
									: 'var(--ds-raised)'}; color: {item.tone === 'warning'
								? 'var(--ds-caution)'
								: item.tone === 'highlight'
									? 'var(--ds-accent)'
									: 'var(--ds-muted)'}"
						>
							{item.tone}
						</span>
						<span class="text-[10.5px] leading-snug text-body">{item.text}</span>
					</li>
				{/each}
			</ul>
		</div>
	</div>
</div>
