/**
 * ECharts option builder.
 *
 * One function per chart family, all sharing a common theme so every card on the dashboard
 * looks like it belongs to the same product. Nothing here touches the DOM - it returns a
 * plain option object, which keeps it testable and lets the Svelte component stay thin.
 */

import type { EChartsOption } from 'echarts';
import type { ChartData, ChartSpec, PaletteId } from '../types';
import { colorAt, correlationColors, paletteColors } from './palette';
import { compactNumber, formatNumber, truncate, type FormatOptions } from '../format';

export type ThemeContext = {
	dark: boolean;
	palette: PaletteId;
	fmt: FormatOptions;
	animations: boolean;
};

function tokens(dark: boolean) {
	return dark
		? {
				grid: '#27304a',
				axis: '#94a3b8',
				label: '#cbd5e1',
				tooltipBg: '#1b2236',
				tooltipLine: '#39435f',
				tooltipText: '#f1f5f9',
				ink: '#f1f5f9'
			}
		: {
				grid: '#e8ebf0',
				axis: '#64748b',
				label: '#334155',
				tooltipBg: '#ffffff',
				tooltipLine: '#cdd3dc',
				tooltipText: '#0f172a',
				ink: '#0f172a'
			};
}

function baseOption(ctx: ThemeContext): EChartsOption {
	const t = tokens(ctx.dark);
	return {
		animation: ctx.animations,
		animationDuration: 420,
		animationEasing: 'cubicOut',
		textStyle: {
			fontFamily: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
			color: t.label
		},
		grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
		tooltip: {
			trigger: 'axis',
			backgroundColor: t.tooltipBg,
			borderColor: t.tooltipLine,
			borderWidth: 1,
			padding: [8, 12],
			textStyle: { color: t.tooltipText, fontSize: 12 },
			extraCssText: 'box-shadow: 0 8px 24px -8px rgba(15,23,42,.25); border-radius: 8px;',
			axisPointer: { type: 'line', lineStyle: { color: t.tooltipLine } }
		}
	};
}

function axisLabelFormatter(ctx: ThemeContext) {
	return (value: number) => compactNumber(value, ctx.fmt);
}

function valueAxis(ctx: ThemeContext, name?: string) {
	const t = tokens(ctx.dark);
	return {
		type: 'value' as const,
		name,
		nameTextStyle: { color: t.axis, fontSize: 11, padding: [0, 0, 0, 4] },
		axisLine: { show: false },
		axisTick: { show: false },
		splitLine: { lineStyle: { color: t.grid, type: 'solid' as const } },
		axisLabel: { color: t.axis, fontSize: 11, formatter: axisLabelFormatter(ctx) }
	};
}

function categoryAxis(ctx: ThemeContext, labels: string[], rotate = false) {
	const t = tokens(ctx.dark);
	return {
		type: 'category' as const,
		data: labels,
		boundaryGap: true,
		axisLine: { lineStyle: { color: t.grid } },
		axisTick: { show: false },
		axisLabel: {
			color: t.axis,
			fontSize: 11,
			hideOverlap: true,
			rotate: rotate ? 32 : 0,
			formatter: (v: string) => truncate(v, 18)
		}
	};
}

/** Tooltip body shared by every categorical chart. */
function seriesTooltipFormatter(ctx: ThemeContext, total?: number) {
	return (params: unknown) => {
		const list = Array.isArray(params) ? params : [params];
		if (list.length === 0) return '';
		const first = list[0] as { axisValueLabel?: string; name?: string };
		const head = first.axisValueLabel ?? first.name ?? '';
		const lines = list.map((p) => {
			const item = p as { marker?: string; seriesName?: string; value?: unknown; name?: string };
			const raw = Array.isArray(item.value) ? item.value[1] : item.value;
			const n = typeof raw === 'number' ? raw : Number(raw);
			const shown = Number.isFinite(n) ? formatNumber(n, ctx.fmt) : '—';
			const share =
				total && total !== 0 && Number.isFinite(n)
					? ` <span style="opacity:.6">(${((n / total) * 100).toFixed(1)}%)</span>`
					: '';
			return `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
				<span>${item.marker ?? ''}${item.seriesName ?? item.name ?? ''}</span>
				<strong style="margin-left:12px">${shown}${share}</strong>
			</div>`;
		});
		return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${lines.join('')}`;
	};
}

function legend(ctx: ThemeContext, show: boolean) {
	const t = tokens(ctx.dark);
	return show
		? {
				show: true,
				bottom: 0,
				icon: 'roundRect',
				itemWidth: 10,
				itemHeight: 10,
				textStyle: { color: t.axis, fontSize: 11 }
			}
		: { show: false };
}

/* ------------------------------ line / area ------------------------------- */

function lineOption(spec: ChartSpec, data: ChartData, ctx: ThemeContext): EChartsOption {
	const colors = paletteColors(ctx.palette, ctx.dark);
	const multi = data.series.length > 1;
	const area = spec.type === 'area';
	const base = baseOption(ctx);

	return {
		...base,
		color: colors,
		legend: legend(ctx, multi),
		grid: { ...(base.grid as object), bottom: multi ? 28 : 8 },
		tooltip: { ...(base.tooltip as object), formatter: seriesTooltipFormatter(ctx) },
		xAxis: categoryAxis(ctx, data.labels, data.labels.length > 14),
		yAxis: valueAxis(ctx),
		series: data.series.map((s, i) => {
			const color = multi ? colors[i % colors.length] : colorAt(ctx.palette, ctx.dark, spec.colorIndex ?? 0);
			return {
				name: s.name,
				type: 'line' as const,
				data: s.values,
				smooth: 0.28,
				smoothMonotone: 'x' as const,
				showSymbol: data.labels.length <= 40,
				symbolSize: 6,
				connectNulls: false,
				lineStyle: { width: 2.4, color },
				itemStyle: { color, borderWidth: 2, borderColor: ctx.dark ? '#151b2d' : '#ffffff' },
				areaStyle: area
					? {
							opacity: 0.18,
							color: {
								type: 'linear' as const,
								x: 0,
								y: 0,
								x2: 0,
								y2: 1,
								colorStops: [
									{ offset: 0, color },
									{ offset: 1, color: 'transparent' }
								]
							}
						}
					: undefined,
				emphasis: { focus: 'series' as const }
			};
		})
	};
}

/* --------------------------------- bars ----------------------------------- */

function barOption(spec: ChartSpec, data: ChartData, ctx: ThemeContext): EChartsOption {
	const horizontal = spec.type === 'hbar' || spec.type === 'topn';
	const colors = paletteColors(ctx.palette, ctx.dark);
	const multi = data.series.length > 1;
	const single = colorAt(ctx.palette, ctx.dark, spec.colorIndex ?? 0);
	const base = baseOption(ctx);
	// Top-N reads best largest-at-top, which means reversing for a horizontal axis.
	const labels = horizontal ? [...data.labels].reverse() : data.labels;
	const series = data.series.map((s, i) => ({
		name: s.name,
		type: 'bar' as const,
		data: horizontal ? [...s.values].reverse() : s.values,
		barMaxWidth: horizontal ? 18 : 42,
		itemStyle: {
			color: multi ? colors[i % colors.length] : single,
			borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
		},
		emphasis: { focus: 'series' as const, itemStyle: { opacity: 0.85 } }
	}));

	return {
		...base,
		color: colors,
		legend: legend(ctx, multi),
		grid: { ...(base.grid as object), bottom: multi ? 28 : 8 },
		tooltip: {
			...(base.tooltip as object),
			axisPointer: { type: 'shadow' },
			formatter: seriesTooltipFormatter(ctx, data.total)
		},
		xAxis: horizontal ? valueAxis(ctx) : categoryAxis(ctx, labels, labels.length > 8),
		yAxis: horizontal
			? {
					...categoryAxis(ctx, labels),
					boundaryGap: true,
					axisLabel: {
						color: tokens(ctx.dark).axis,
						fontSize: 11,
						formatter: (v: string) => truncate(v, 24)
					}
				}
			: valueAxis(ctx),
		series
	};
}

/* ------------------------------ pie / donut -------------------------------- */

function pieOption(spec: ChartSpec, data: ChartData, ctx: ThemeContext): EChartsOption {
	const colors = paletteColors(ctx.palette, ctx.dark);
	const t = tokens(ctx.dark);
	const values = data.series[0]?.values ?? [];
	const items = data.labels.map((label, i) => ({
		name: label,
		value: values[i] ?? 0
	}));
	const donut = spec.type === 'donut';

	return {
		...baseOption(ctx),
		color: colors,
		legend: {
			show: true,
			type: 'scroll',
			orient: 'vertical',
			right: 0,
			top: 'middle',
			itemWidth: 10,
			itemHeight: 10,
			icon: 'circle',
			textStyle: { color: t.axis, fontSize: 11 },
			formatter: (name: string) => truncate(name, 18)
		},
		tooltip: {
			trigger: 'item',
			backgroundColor: t.tooltipBg,
			borderColor: t.tooltipLine,
			borderWidth: 1,
			textStyle: { color: t.tooltipText, fontSize: 12 },
			extraCssText: 'box-shadow: 0 8px 24px -8px rgba(15,23,42,.25); border-radius: 8px;',
			formatter: (p: unknown) => {
				const item = p as { marker: string; name: string; value: number; percent: number };
				return `<div style="font-weight:600;margin-bottom:2px">${item.name}</div>
					${item.marker} ${formatNumber(item.value, ctx.fmt)} <strong>(${item.percent}%)</strong>`;
			}
		},
		series: [
			{
				type: 'pie',
				radius: donut ? ['52%', '76%'] : ['0%', '72%'],
				center: ['38%', '50%'],
				avoidLabelOverlap: true,
				padAngle: donut ? 1.5 : 0,
				itemStyle: {
					borderRadius: donut ? 4 : 0,
					borderColor: ctx.dark ? '#151b2d' : '#ffffff',
					borderWidth: 2
				},
				label: { show: false },
				labelLine: { show: false },
				emphasis: {
					scaleSize: 6,
					label: donut
						? {
								show: true,
								fontSize: 13,
								fontWeight: 600,
								color: t.ink,
								formatter: (p: unknown) => {
									const item = p as { name: string; percent: number };
									return `${truncate(item.name, 14)}\n${item.percent}%`;
								}
							}
						: { show: false }
				},
				data: items
			}
		]
	};
}

/* ------------------------------- histogram --------------------------------- */

function histogramOption(spec: ChartSpec, data: ChartData, ctx: ThemeContext): EChartsOption {
	const color = colorAt(ctx.palette, ctx.dark, spec.colorIndex ?? 0);
	const base = baseOption(ctx);
	return {
		...base,
		tooltip: {
			...(base.tooltip as object),
			axisPointer: { type: 'shadow' },
			formatter: (params: unknown) => {
				const list = Array.isArray(params) ? params : [params];
				const p = list[0] as { axisValueLabel: string; value: number };
				const share = data.total ? ((p.value / data.total) * 100).toFixed(1) : null;
				return `<div style="font-weight:600;margin-bottom:2px">${p.axisValueLabel}</div>
					${p.value.toLocaleString()} rows${share ? ` <span style="opacity:.6">(${share}%)</span>` : ''}`;
			}
		},
		xAxis: categoryAxis(ctx, data.labels, data.labels.length > 10),
		yAxis: valueAxis(ctx, 'rows'),
		series: [
			{
				type: 'bar',
				data: data.series[0]?.values ?? [],
				barCategoryGap: '8%',
				itemStyle: { color, borderRadius: [3, 3, 0, 0] },
				emphasis: { itemStyle: { opacity: 0.85 } }
			}
		]
	};
}

/* -------------------------------- scatter ---------------------------------- */

function scatterOption(spec: ChartSpec, data: ChartData, ctx: ThemeContext): EChartsOption {
	const color = colorAt(ctx.palette, ctx.dark, spec.colorIndex ?? 0);
	const t = tokens(ctx.dark);
	const points = (data.points ?? []).map((p) => [p.x, p.y]);
	return {
		...baseOption(ctx),
		tooltip: {
			trigger: 'item',
			backgroundColor: t.tooltipBg,
			borderColor: t.tooltipLine,
			borderWidth: 1,
			textStyle: { color: t.tooltipText, fontSize: 12 },
			extraCssText: 'box-shadow: 0 8px 24px -8px rgba(15,23,42,.25); border-radius: 8px;',
			formatter: (p: unknown) => {
				const item = p as { value: [number, number] };
				return `${spec.x}: <strong>${formatNumber(item.value[0], ctx.fmt)}</strong><br/>${spec.y}: <strong>${formatNumber(item.value[1], ctx.fmt)}</strong>`;
			}
		},
		// Axis names are placed at the END of each axis rather than ECharts' default
		// top-left/bottom-left, where the Y name overlaps the card's subtitle line.
		grid: { left: 8, right: 20, top: 14, bottom: 26, containLabel: true },
		xAxis: {
			...valueAxis(ctx, spec.x ?? undefined),
			scale: true,
			nameLocation: 'end',
			nameGap: 6,
			nameTextStyle: { color: t.axis, fontSize: 11, align: 'right', verticalAlign: 'top' }
		},
		yAxis: {
			...valueAxis(ctx, spec.y ?? undefined),
			scale: true,
			nameLocation: 'end',
			nameGap: 10,
			nameTextStyle: { color: t.axis, fontSize: 11, align: 'left' }
		},
		series: [
			{
				type: 'scatter',
				data: points,
				symbolSize: points.length > 1500 ? 4 : points.length > 400 ? 6 : 9,
				itemStyle: { color, opacity: points.length > 800 ? 0.4 : 0.68 },
				emphasis: { itemStyle: { opacity: 1 } },
				large: points.length > 2000,
				largeThreshold: 2000
			}
		]
	};
}

/* -------------------------------- heatmap ---------------------------------- */

function heatmapOption(data: ChartData, ctx: ThemeContext): EChartsOption {
	const t = tokens(ctx.dark);
	const matrix = data.matrix;
	if (!matrix) return baseOption(ctx);
	return {
		...baseOption(ctx),
		grid: { left: 8, right: 8, top: 8, bottom: 56, containLabel: true },
		tooltip: {
			position: 'top',
			backgroundColor: t.tooltipBg,
			borderColor: t.tooltipLine,
			borderWidth: 1,
			textStyle: { color: t.tooltipText, fontSize: 12 },
			extraCssText: 'box-shadow: 0 8px 24px -8px rgba(15,23,42,.25); border-radius: 8px;',
			formatter: (p: unknown) => {
				const item = p as { value: [number, number, number] };
				const [x, y, v] = item.value;
				const strength = Math.abs(v) >= 0.7 ? 'strong' : Math.abs(v) >= 0.4 ? 'moderate' : 'weak';
				return `<div style="font-weight:600">${matrix.yLabels[y]} ↔ ${matrix.xLabels[x]}</div>
					r = <strong>${v.toFixed(2)}</strong> <span style="opacity:.7">(${strength} ${v >= 0 ? 'positive' : 'negative'})</span>`;
			}
		},
		xAxis: {
			type: 'category',
			data: matrix.xLabels,
			splitArea: { show: true },
			axisLine: { show: false },
			axisTick: { show: false },
			axisLabel: { color: t.axis, fontSize: 10, rotate: 36, formatter: (v: string) => truncate(v, 14) }
		},
		yAxis: {
			type: 'category',
			data: matrix.yLabels,
			splitArea: { show: true },
			axisLine: { show: false },
			axisTick: { show: false },
			axisLabel: { color: t.axis, fontSize: 10, formatter: (v: string) => truncate(v, 14) }
		},
		visualMap: {
			min: -1,
			max: 1,
			calculable: true,
			orient: 'horizontal',
			left: 'center',
			bottom: 0,
			itemWidth: 12,
			itemHeight: 90,
			precision: 2,
			textStyle: { color: t.axis, fontSize: 10 },
			inRange: { color: correlationColors(ctx.dark) }
		},
		series: [
			{
				type: 'heatmap',
				data: matrix.cells,
				label: {
					show: matrix.xLabels.length <= 8,
					fontSize: 10,
					color: t.ink,
					formatter: (p: unknown) => {
						const item = p as { value: [number, number, number] };
						return item.value[2].toFixed(2);
					}
				},
				itemStyle: { borderColor: ctx.dark ? '#151b2d' : '#ffffff', borderWidth: 2, borderRadius: 3 },
				emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 2 } }
			}
		]
	};
}

/* ------------------------------- dispatcher -------------------------------- */

export function buildOption(spec: ChartSpec, data: ChartData, ctx: ThemeContext): EChartsOption {
	switch (spec.type) {
		case 'line':
		case 'area':
			return lineOption(spec, data, ctx);
		case 'bar':
		case 'hbar':
		case 'topn':
			return barOption(spec, data, ctx);
		case 'pie':
		case 'donut':
			return pieOption(spec, data, ctx);
		case 'histogram':
			return histogramOption(spec, data, ctx);
		case 'scatter':
			return scatterOption(spec, data, ctx);
		case 'heatmap':
			return heatmapOption(data, ctx);
		default:
			return barOption(spec, data, ctx);
	}
}

/**
 * Minimal sparkline option for KPI cards: no axes, no tooltip, just the shape of the trend.
 * Coloured by direction so a falling metric reads as a warning at a glance.
 */
export function sparklineOption(values: number[], dark: boolean, positive: boolean): EChartsOption {
	const color = positive ? (dark ? '#34d399' : '#059669') : dark ? '#fb7185' : '#e11d48';
	return {
		animation: false,
		grid: { left: 0, right: 0, top: 2, bottom: 2 },
		xAxis: { type: 'category', show: false, boundaryGap: false, data: values.map((_, i) => i) },
		yAxis: { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
		tooltip: { show: false },
		series: [
			{
				type: 'line',
				data: values,
				smooth: 0.3,
				showSymbol: false,
				lineStyle: { width: 1.8, color },
				areaStyle: {
					opacity: 0.16,
					color: {
						type: 'linear',
						x: 0,
						y: 0,
						x2: 0,
						y2: 1,
						colorStops: [
							{ offset: 0, color },
							{ offset: 1, color: 'transparent' }
						]
					}
				}
			}
		]
	};
}

/**
 * Which column/value a click maps to for cross-filtering.
 * Returns null for chart types where clicking a mark has no single dimension value.
 */
export function crossFilterTarget(
	spec: ChartSpec,
	data: ChartData,
	dataIndex: number
): { column: string; value: unknown; label: string; bucket?: ChartSpec['bucket'] } | null {
	if (spec.type === 'scatter' || spec.type === 'heatmap' || spec.type === 'histogram') return null;
	if (!spec.x) return null;
	// Horizontal bars render reversed, so the clicked index must be mirrored back.
	const horizontal = spec.type === 'hbar' || spec.type === 'topn';
	const index = horizontal ? data.labels.length - 1 - dataIndex : dataIndex;
	const key = data.keys[index];
	const label = data.labels[index];
	if (key === undefined || label === undefined) return null;
	// The pie's rolled-up "Other" slice has no single value to filter on.
	if (String(key) === '__other__') return null;
	// Carry the bucket so the filter selects the same span the user clicked.
	return { column: spec.x, value: key, label, bucket: spec.bucket };
}
