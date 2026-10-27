/**
 * Export helpers: PDF report, dashboard PNG, cleaned CSV, and the saved-dashboard
 * thumbnail.
 *
 * PDF is generated with pdf-lib in the browser - there is no server to render on. The
 * layout is deliberately simple and text-first (title block, KPI table, insights, cleaning
 * log, column reference) so the PDF is readable and small, with chart images appended as
 * full-width bitmaps captured from the live ECharts canvases.
 */

import type { Dataset, Insight, KpiValue, QualityReport, CleanStep } from '../types';

export type ReportInput = {
	name: string;
	dataset: Dataset;
	report: QualityReport;
	kpis: KpiValue[];
	insights: Insight[];
	cleanLog: CleanStep[];
	filters: string[];
	rowsAfterFilters: number;
	/** PNG data URLs of the dashboard charts, in display order. */
	chartImages: { title: string; dataUrl: string }[];
};

/** Download a blob under a filename. */
export function download(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	// Revoke on the next tick so Safari has time to start the download.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
	const a = document.createElement('a');
	a.href = dataUrl;
	a.download = filename;
	a.click();
}

/** Safe filename stem from a dashboard name. */
export function slugify(name: string): string {
	return (
		name
			.trim()
			.replace(/[^a-z0-9]+/gi, '-')
			.replace(/^-+|-+$/g, '')
			.toLowerCase() || 'datastory'
	);
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * PDF report.
 *
 * pdf-lib's standard Helvetica only covers WinAnsi, so any character outside it (₹, em
 * dash, smart quotes, Devanagari) would throw. `ascii()` maps the ones DataStory actually
 * emits and drops the rest, which is better than a failed export.
 */
function ascii(text: string): string {
	return text
		.replace(/₹/g, 'Rs.')
		.replace(/[–—]/g, '-')
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/≥/g, '>=')
		.replace(/≤/g, '<=')
		.replace(/↔/g, '<->')
		.replace(/→/g, '->')
		.replace(/×/g, 'x')
		.replace(/·/g, '-')
		.replace(/…/g, '...')
		.replace(/[^\x20-\x7E\n]/g, '');
}

export async function exportPdf(input: ReportInput): Promise<void> {
	const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
	const pdf = await PDFDocument.create();
	pdf.setTitle(`${input.name} - DataStory report`);
	pdf.setCreator('DataStory');
	pdf.setProducer('DataStory (browser)');

	const regular = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

	// A4 portrait in points.
	const W = 595.28;
	const H = 841.89;
	const M = 48;
	const INK = rgb(0.06, 0.09, 0.16);
	const BODY = rgb(0.2, 0.25, 0.33);
	const MUTED = rgb(0.39, 0.45, 0.55);
	const LINE = rgb(0.89, 0.91, 0.93);
	const ACCENT = rgb(0.31, 0.27, 0.9);

	let page = pdf.addPage([W, H]);
	let y = H - M;

	function newPage() {
		page = pdf.addPage([W, H]);
		y = H - M;
	}

	function space(needed: number) {
		if (y - needed < M) newPage();
	}

	/** Greedy word wrap at a given width. */
	function wrap(text: string, font: typeof regular, size: number, width: number): string[] {
		const words = ascii(text).split(/\s+/);
		const lines: string[] = [];
		let line = '';
		for (const word of words) {
			const candidate = line ? `${line} ${word}` : word;
			if (font.widthOfTextAtSize(candidate, size) > width && line) {
				lines.push(line);
				line = word;
			} else {
				line = candidate;
			}
		}
		if (line) lines.push(line);
		return lines;
	}

	function text(
		value: string,
		opts: { size?: number; font?: typeof regular; color?: typeof INK; indent?: number; gap?: number } = {}
	) {
		const size = opts.size ?? 10;
		const font = opts.font ?? regular;
		const color = opts.color ?? BODY;
		const indent = opts.indent ?? 0;
		const lines = wrap(value, font, size, W - M * 2 - indent);
		for (const line of lines) {
			space(size + 4);
			page.drawText(line, { x: M + indent, y: y - size, size, font, color });
			y -= size + 3.5;
		}
		y -= opts.gap ?? 0;
	}

	function heading(value: string) {
		space(32);
		y -= 10;
		page.drawText(ascii(value), { x: M, y: y - 12, size: 12.5, font: bold, color: INK });
		y -= 20;
		page.drawLine({
			start: { x: M, y },
			end: { x: W - M, y },
			thickness: 0.8,
			color: LINE
		});
		y -= 12;
	}

	// ------------------------------ title block ------------------------------
	page.drawRectangle({ x: M, y: y - 4, width: 28, height: 4, color: ACCENT });
	y -= 22;
	page.drawText(ascii(input.name), { x: M, y: y - 20, size: 21, font: bold, color: INK });
	y -= 32;
	page.drawText('DataStory report', { x: M, y: y - 11, size: 11, font: regular, color: MUTED });
	y -= 24;

	const meta = [
		`Generated ${today()}`,
		`${input.dataset.rowCount.toLocaleString()} rows x ${input.dataset.columns.length} columns`,
		`Data health ${input.report.score}/100 (${input.report.grade})`
	];
	if (input.filters.length) meta.push(`Filters: ${input.filters.join(' | ')}`);
	if (input.rowsAfterFilters !== input.dataset.rowCount) {
		meta.push(`${input.rowsAfterFilters.toLocaleString()} rows match the active filters`);
	}
	for (const line of meta) text(line, { size: 9.5, color: MUTED });

	// --------------------------------- KPIs ---------------------------------
	if (input.kpis.length) {
		heading('Key figures');
		for (const kpi of input.kpis) {
			space(18);
			page.drawText(ascii(kpi.spec.label), { x: M, y: y - 10, size: 10, font: regular, color: BODY });
			const value = ascii(kpi.display);
			const width = bold.widthOfTextAtSize(value, 11);
			page.drawText(value, { x: W - M - width, y: y - 10, size: 11, font: bold, color: INK });
			y -= 15;
			if (kpi.deltaPct !== null && kpi.deltaPct !== undefined) {
				const delta = `${kpi.deltaPct >= 0 ? '+' : ''}${kpi.deltaPct.toFixed(1)}% vs previous period`;
				page.drawText(ascii(delta), { x: M, y: y - 8, size: 8.5, font: regular, color: MUTED });
				y -= 12;
			}
			page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.4, color: LINE });
			y -= 5;
		}
	}

	// ------------------------------- insights -------------------------------
	if (input.insights.length) {
		heading('What the data says');
		for (const insight of input.insights) {
			space(34);
			const tag = insight.severity.toUpperCase();
			page.drawText(tag, { x: M, y: y - 8, size: 7.5, font: bold, color: MUTED });
			y -= 12;
			text(insight.title, { size: 10.5, font: bold, color: INK });
			text(insight.detail, { size: 9.5, color: BODY, gap: 6 });
		}
	}

	// ------------------------------- cleaning -------------------------------
	if (input.cleanLog.length) {
		heading('How the data was prepared');
		input.cleanLog.forEach((step, i) => {
			text(`${i + 1}. ${step.label}`, { size: 9.5, color: BODY });
		});
		y -= 4;
		text(
			`Health score improved from the imported file to ${input.report.score}/100 after cleaning.`,
			{ size: 9, color: MUTED }
		);
	}

	// -------------------------------- charts --------------------------------
	for (const chart of input.chartImages) {
		try {
			const bytes = dataUrlToBytes(chart.dataUrl);
			const image = await pdf.embedPng(bytes);
			const maxWidth = W - M * 2;
			const scale = Math.min(1, maxWidth / image.width);
			const drawWidth = image.width * scale;
			const drawHeight = image.height * scale;

			space(drawHeight + 28);
			page.drawText(ascii(chart.title), { x: M, y: y - 11, size: 10.5, font: bold, color: INK });
			y -= 18;
			page.drawImage(image, { x: M, y: y - drawHeight, width: drawWidth, height: drawHeight });
			y -= drawHeight + 14;
		} catch {
			// A chart that failed to rasterise should not sink the whole export.
			text(`[Chart "${chart.title}" could not be rendered into the PDF]`, { size: 9, color: MUTED });
		}
	}

	// ---------------------------- column reference ---------------------------
	heading('Columns');
	for (const col of input.dataset.columns) {
		const parts = [`${col.name} - ${col.type}`];
		if (col.missing > 0) {
			parts.push(`${col.missing.toLocaleString()} missing`);
		}
		if (col.type === 'number' && col.numeric) {
			parts.push(
				`min ${round(col.numeric.min)}, median ${round(col.numeric.median)}, max ${round(col.numeric.max)}`
			);
		} else if (col.type === 'date' && col.date) {
			parts.push(
				`${new Date(col.date.min).toISOString().slice(0, 10)} to ${new Date(col.date.max).toISOString().slice(0, 10)}`
			);
		} else {
			parts.push(`${col.distinctCount.toLocaleString()} distinct`);
		}
		text(parts.join(' - '), { size: 9, color: BODY });
	}

	// -------------------------------- footer --------------------------------
	const pages = pdf.getPages();
	pages.forEach((p, i) => {
		p.drawText(
			ascii(`DataStory - analysed entirely in the browser - page ${i + 1} of ${pages.length}`),
			{ x: M, y: 26, size: 7.5, font: regular, color: MUTED }
		);
	});

	const bytes = await pdf.save();
	download(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${slugify(input.name)}-${today()}.pdf`);
}

function round(n: number): string {
	return Number(n.toFixed(2)).toLocaleString();
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
	const base64 = dataUrl.split(',')[1] ?? '';
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/**
 * Compose the dashboard chart canvases into one PNG.
 *
 * html2canvas-style DOM rasterisation is unreliable for canvas-in-CSS-grid layouts, so
 * instead we ask each ECharts instance for its own PNG and stack them on an offscreen
 * canvas with a header. That is exact, fast and dependency-free.
 */
export async function exportDashboardPng(input: {
	name: string;
	subtitle: string;
	kpis: KpiValue[];
	chartImages: { title: string; dataUrl: string }[];
	dark: boolean;
}): Promise<void> {
	const WIDTH = 1280;
	const PAD = 32;
	const HEADER = input.kpis.length > 0 ? 190 : 110;
	const TITLE_H = 30;

	const images = await Promise.all(
		input.chartImages.map(
			(c) =>
				new Promise<{ title: string; img: HTMLImageElement } | null>((resolve) => {
					const img = new Image();
					img.onload = () => resolve({ title: c.title, img });
					img.onerror = () => resolve(null);
					img.src = c.dataUrl;
				})
		)
	);
	const loaded = images.filter((i): i is { title: string; img: HTMLImageElement } => i !== null);

	const innerWidth = WIDTH - PAD * 2;
	const scaled = loaded.map((item) => {
		const scale = innerWidth / item.img.width;
		return { ...item, w: innerWidth, h: Math.round(item.img.height * scale) };
	});

	const totalHeight =
		HEADER + scaled.reduce((sum, s) => sum + s.h + TITLE_H + 18, 0) + PAD;

	const canvas = document.createElement('canvas');
	canvas.width = WIDTH;
	canvas.height = Math.max(totalHeight, 400);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('This browser could not create a canvas for the PNG export.');

	const bg = input.dark ? '#0b1020' : '#f6f7f9';
	const surface = input.dark ? '#151b2d' : '#ffffff';
	const ink = input.dark ? '#f1f5f9' : '#0f172a';
	const muted = input.dark ? '#94a3b8' : '#64748b';
	const line = input.dark ? '#27304a' : '#e4e7ec';

	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Header
	ctx.fillStyle = '#4f46e5';
	ctx.fillRect(PAD, PAD, 28, 4);
	ctx.fillStyle = ink;
	ctx.font = '600 26px Inter, system-ui, sans-serif';
	ctx.fillText(input.name, PAD, PAD + 38);
	ctx.fillStyle = muted;
	ctx.font = '14px Inter, system-ui, sans-serif';
	ctx.fillText(input.subtitle, PAD, PAD + 62);

	// KPI strip
	if (input.kpis.length > 0) {
		const count = Math.min(input.kpis.length, 6);
		const gap = 12;
		const cardW = (innerWidth - gap * (count - 1)) / count;
		const top = PAD + 86;
		for (let i = 0; i < count; i++) {
			const kpi = input.kpis[i];
			const x = PAD + i * (cardW + gap);
			ctx.fillStyle = surface;
			roundRect(ctx, x, top, cardW, 78, 10);
			ctx.fill();
			ctx.strokeStyle = line;
			ctx.lineWidth = 1;
			roundRect(ctx, x, top, cardW, 78, 10);
			ctx.stroke();

			ctx.fillStyle = muted;
			ctx.font = '600 10px Inter, system-ui, sans-serif';
			ctx.fillText(truncateCtx(ctx, kpi.spec.label.toUpperCase(), cardW - 24), x + 12, top + 22);
			ctx.fillStyle = ink;
			ctx.font = '600 22px Inter, system-ui, sans-serif';
			ctx.fillText(truncateCtx(ctx, kpi.display, cardW - 24), x + 12, top + 50);
			if (kpi.deltaPct !== null && kpi.deltaPct !== undefined) {
				ctx.fillStyle = kpi.deltaPct >= 0 ? '#059669' : '#e11d48';
				ctx.font = '600 11px Inter, system-ui, sans-serif';
				ctx.fillText(
					`${kpi.deltaPct >= 0 ? '+' : ''}${kpi.deltaPct.toFixed(1)}%`,
					x + 12,
					top + 68
				);
			}
		}
	}

	// Charts
	let y = HEADER;
	for (const item of scaled) {
		ctx.fillStyle = surface;
		roundRect(ctx, PAD, y, innerWidth, item.h + TITLE_H + 8, 12);
		ctx.fill();
		ctx.strokeStyle = line;
		roundRect(ctx, PAD, y, innerWidth, item.h + TITLE_H + 8, 12);
		ctx.stroke();

		ctx.fillStyle = ink;
		ctx.font = '600 14px Inter, system-ui, sans-serif';
		ctx.fillText(truncateCtx(ctx, item.title, innerWidth - 32), PAD + 16, y + 22);
		ctx.drawImage(item.img, PAD, y + TITLE_H, item.w, item.h);
		y += item.h + TITLE_H + 18;
	}

	// Footer
	ctx.fillStyle = muted;
	ctx.font = '11px Inter, system-ui, sans-serif';
	ctx.fillText('Generated by DataStory — analysed entirely in the browser', PAD, canvas.height - 14);

	await new Promise<void>((resolve) => {
		canvas.toBlob((blob) => {
			if (blob) download(blob, `${slugify(input.name)}-${today()}.png`);
			resolve();
		}, 'image/png');
	});
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function truncateCtx(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let out = text;
	while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
	return `${out}…`;
}

/**
 * Inline SVG thumbnail for the My Dashboards list.
 * Drawn from the real KPI sparkline and chart mix so each card is distinguishable,
 * and stored as a string so the list needs no image decoding or extra storage.
 */
export function buildThumbnail(input: {
	kpis: KpiValue[];
	chartTypes: string[];
	colors: string[];
	dark: boolean;
}): string {
	const bg = input.dark ? '#151b2d' : '#ffffff';
	const line = input.dark ? '#27304a' : '#e4e7ec';
	const c = (i: number) => input.colors[i % input.colors.length] ?? '#4f46e5';

	const spark = input.kpis.find((k) => k.sparkline.length >= 2)?.sparkline ?? [];
	let path = '';
	if (spark.length >= 2) {
		const pts = spark.slice(-18);
		const min = Math.min(...pts);
		const max = Math.max(...pts);
		const range = max - min || 1;
		const step = 150 / (pts.length - 1);
		path = pts
			.map((v, i) => `${i === 0 ? 'M' : 'L'}${(10 + i * step).toFixed(1)},${(56 - ((v - min) / range) * 30).toFixed(1)}`)
			.join(' ');
	}

	const bars = [0.95, 0.72, 0.58, 0.44, 0.3];

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 100" width="170" height="100">
<rect width="170" height="100" rx="8" fill="${bg}"/>
${[0, 1, 2, 3].map((i) => `<rect x="${8 + i * 39}" y="8" width="35" height="14" rx="3" fill="${line}"/>`).join('')}
${path ? `<path d="${path}" fill="none" stroke="${c(0)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
${bars
	.map(
		(h, i) =>
			`<rect x="${10 + i * 14}" y="${92 - h * 26}" width="9" height="${(h * 26).toFixed(1)}" rx="2" fill="${c(i + 1)}" opacity="${0.9 - i * 0.12}"/>`
	)
	.join('')}
<circle cx="138" cy="76" r="15" fill="none" stroke="${c(2)}" stroke-width="7" stroke-dasharray="66 28" transform="rotate(-90 138 76)"/>
</svg>`;
}
