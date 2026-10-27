<script lang="ts">
	/**
	 * Thin ECharts wrapper.
	 *
	 * - echarts is imported dynamically with only the renderers/charts actually used, so
	 *   the bundle stays well under the full ~1 MB library.
	 * - Resizing uses ResizeObserver, which is what makes the cards responsive when the
	 *   grid reflows or a card is resized by drag.
	 * - `setOption(option, true)` replaces rather than merges, so switching chart type
	 *   never leaves a stale axis behind.
	 */
	import type { ECharts, EChartsOption } from 'echarts';

	let {
		option,
		height = 300,
		onElementClick,
		ariaLabel = 'Chart'
	}: {
		option: EChartsOption;
		height?: number;
		onElementClick?: (params: { dataIndex: number; seriesIndex: number; name: string }) => void;
		ariaLabel?: string;
	} = $props();

	let container = $state<HTMLDivElement | null>(null);
	let chart: ECharts | null = null;
	let observer: ResizeObserver | null = null;
	let ready = $state(false);

	$effect(() => {
		if (!container) return;
		let disposed = false;

		(async () => {
			const echarts = await import('echarts/core');
			const [{ LineChart, BarChart, PieChart, ScatterChart, HeatmapChart }, renderers, components] =
				await Promise.all([
					import('echarts/charts'),
					import('echarts/renderers'),
					import('echarts/components')
				]);
			echarts.use([
				LineChart,
				BarChart,
				PieChart,
				ScatterChart,
				HeatmapChart,
				components.GridComponent,
				components.TooltipComponent,
				components.LegendComponent,
				components.VisualMapComponent,
				components.DataZoomComponent,
				components.MarkLineComponent,
				renderers.CanvasRenderer
			]);
			if (disposed || !container) return;

			chart = echarts.init(container, undefined, { renderer: 'canvas' });
			chart.setOption(option, true);
			ready = true;

			chart.on('click', (params) => {
				onElementClick?.({
					dataIndex: (params as { dataIndex: number }).dataIndex ?? 0,
					seriesIndex: (params as { seriesIndex: number }).seriesIndex ?? 0,
					name: String((params as { name?: string }).name ?? '')
				});
			});

			observer = new ResizeObserver(() => chart?.resize());
			observer.observe(container);
		})();

		return () => {
			disposed = true;
			observer?.disconnect();
			observer = null;
			chart?.dispose();
			chart = null;
			ready = false;
		};
	});

	// Re-apply whenever the option object changes (new data, new theme, new palette).
	$effect(() => {
		const next = option;
		if (chart && ready) chart.setOption(next, true);
	});

	// Height changes come from card resizing.
	$effect(() => {
		const h = height;
		if (chart && ready) {
			void h;
			chart.resize();
		}
	});

	/** Used by "Download as PNG" on the chart card. */
	export function toDataUrl(pixelRatio = 2, backgroundColor = '#ffffff'): string | null {
		if (!chart) return null;
		return chart.getDataURL({ type: 'png', pixelRatio, backgroundColor });
	}
</script>

<div
	bind:this={container}
	style="height: {height}px"
	class="w-full"
	role="img"
	aria-label={ariaLabel}
></div>
