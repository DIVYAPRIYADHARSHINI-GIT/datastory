/**
 * Chart colour palettes.
 *
 * Each palette ships a light and a dark variant. The dark variants are lifted in
 * lightness so every series keeps readable contrast on the dark surface (#151b2d) -
 * the same hex in both modes is the usual reason BI tools look broken in dark mode.
 */

import type { PaletteId } from '../types';

export type Palette = {
	id: PaletteId;
	name: string;
	description: string;
	light: string[];
	dark: string[];
};

export const PALETTES: Palette[] = [
	{
		id: 'signature',
		name: 'Signature',
		description: 'Balanced multi-hue set. Best for mixed dashboards.',
		light: ['#4f46e5', '#0d9488', '#db2777', '#d97706', '#2563eb', '#65a30d', '#9333ea', '#dc2626', '#0891b2', '#7c5c3e'],
		dark: ['#818cf8', '#2dd4bf', '#f472b6', '#fbbf24', '#60a5fa', '#a3e635', '#c084fc', '#fb7185', '#22d3ee', '#d6b08c']
	},
	{
		id: 'ocean',
		name: 'Ocean',
		description: 'Cool blues and teals. Calm, good for trends.',
		light: ['#0369a1', '#0891b2', '#0d9488', '#1d4ed8', '#6366f1', '#0e7490', '#047857', '#4338ca', '#2563eb', '#155e75'],
		dark: ['#38bdf8', '#22d3ee', '#2dd4bf', '#60a5fa', '#a5b4fc', '#67e8f9', '#34d399', '#818cf8', '#93c5fd', '#7dd3fc']
	},
	{
		id: 'sunset',
		name: 'Sunset',
		description: 'Warm oranges to magenta. Strong for rankings.',
		light: ['#c2410c', '#db2777', '#b45309', '#9333ea', '#dc2626', '#ca8a04', '#e11d48', '#7c3aed', '#ea580c', '#be185d'],
		dark: ['#fb923c', '#f472b6', '#fbbf24', '#c084fc', '#fb7185', '#facc15', '#f87171', '#a78bfa', '#fdba74', '#f9a8d4']
	},
	{
		id: 'forest',
		name: 'Forest',
		description: 'Greens and earth tones. Reads well in print.',
		light: ['#15803d', '#4d7c0f', '#0f766e', '#a16207', '#166534', '#65a30d', '#0d9488', '#92400e', '#3f6212', '#115e59'],
		dark: ['#4ade80', '#a3e635', '#2dd4bf', '#facc15', '#86efac', '#bef264', '#5eead4', '#fcd34d', '#d9f99d', '#99f6e4']
	},
	{
		id: 'mono',
		name: 'Monochrome',
		description: 'One accent in shades. Clean for reports.',
		light: ['#312e81', '#4338ca', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#1e1b4b', '#3730a3', '#e0e7ff'],
		dark: ['#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#eef2ff', '#3730a3', '#312e81']
	}
];

export function getPalette(id: PaletteId): Palette {
	return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function paletteColors(id: PaletteId, dark: boolean): string[] {
	const p = getPalette(id);
	return dark ? p.dark : p.light;
}

/** Stable colour for a card, so reordering the dashboard never reshuffles colours. */
export function colorAt(id: PaletteId, dark: boolean, index: number): string {
	const colors = paletteColors(id, dark);
	return colors[((index % colors.length) + colors.length) % colors.length];
}

/** Diverging scale for the correlation heatmap: red (-1) → neutral (0) → blue (+1). */
export function correlationColors(dark: boolean): string[] {
	return dark
		? ['#fb7185', '#f8a5ae', '#2a3146', '#8fb6f5', '#60a5fa']
		: ['#be123c', '#f4a6b4', '#f1f3f7', '#93b4f0', '#2563eb'];
}

/** Semantic colours used by sparklines, deltas and severity tags. */
export function semanticColors(dark: boolean): { positive: string; negative: string; neutral: string } {
	return dark
		? { positive: '#34d399', negative: '#fb7185', neutral: '#94a3b8' }
		: { positive: '#047857', negative: '#be123c', neutral: '#64748b' };
}
