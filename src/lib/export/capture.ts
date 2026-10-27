/**
 * Offscreen chart capture.
 *
 * The export screen is a different route from the dashboard, so the live chart canvases
 * are gone by the time the user hits "Export". Rather than keep every chart mounted, this
 * renders each spec into a detached, fixed-size ECharts instance, grabs its PNG, and
 * disposes it. That gives deterministic, high-resolution output independent of the
 * viewport, and it is the only reliable way to rasterise canvas charts for PDF/PNG.
 */

import type { ChartSpec, Dataset, CellValue, PaletteId } from '../types';
import type { FormatOptions } from '../format';
import { buildChartData } from '../charts/aggregate';
import { buildOption } from '../charts/options';

export type CaptureOptions = {
	dataset: Dataset;
	rows: CellValue[][];
	specs: ChartSpec[];
	fmt: FormatOptions;
	palette: PaletteId;
	dark: boolean;
	/** Render width in CSS px; the PNG comes out at width * pixelRatio. */
	width?: number;
	pixelRatio?: number;
	onProgress?: (done: number, total: number) => void;
};

export async function captureCharts(
	options: CaptureOptions
): Promise<{ title: string; dataUrl: string }[]> {
	const {
		dataset,
		rows,
		specs,
		fmt,
		palette,
		dark,
		width = 1216,
		pixelRatio = 2,
		onProgress
	} = options;
	if (specs.length === 0) return [];

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
		renderers.CanvasRenderer
	]);

	// One offscreen host, reused for every chart. It must be in the document (not
	// display:none) for ECharts to measure it, so it is parked far off-canvas.
	const host = document.createElement('div');
	host.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;pointer-events:none;opacity:0;`;
	document.body.appendChild(host);

	const out: { title: string; dataUrl: string }[] = [];

	try {
		for (let i = 0; i < specs.length; i++) {
			const spec = specs[i];
			const data = buildChartData(dataset, rows, spec, fmt);
			if (data.empty) {
				onProgress?.(i + 1, specs.length);
				continue;
			}

			const height = spec.height ?? 300;
			const target = document.createElement('div');
			target.style.cssText = `width:${width}px;height:${height}px;`;
			host.appendChild(target);

			const chart = echarts.init(target, undefined, {
				renderer: 'canvas',
				width,
				height,
				devicePixelRatio: pixelRatio
			});
			// Animation off: the capture happens immediately, so an animating chart would
			// be photographed mid-transition.
			chart.setOption(
				buildOption(spec, data, { dark, palette, fmt, animations: false }),
				true
			);

			const dataUrl = chart.getDataURL({
				type: 'png',
				pixelRatio,
				backgroundColor: dark ? '#151b2d' : '#ffffff'
			});
			out.push({ title: spec.title, dataUrl });

			chart.dispose();
			target.remove();
			onProgress?.(i + 1, specs.length);
			// Yield so the progress UI can paint between charts.
			await new Promise((r) => setTimeout(r, 0));
		}
	} finally {
		host.remove();
	}

	return out;
}
