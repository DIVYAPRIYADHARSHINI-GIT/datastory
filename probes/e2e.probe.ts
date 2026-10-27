/**
 * End-to-end browser probe: drives the real built site in headless Chrome.
 *
 * This is what proves the product works as a product, not just that the modules pass unit
 * tests: upload a sample, clean it, generate a dashboard, filter, cross-filter, read the
 * story, build a custom chart, save it, reopen it, export a CSV, and switch themes.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	bodyText,
	ensureDashboard,
	loadSample,
	openProbe,
	textOf,
	waitForCharts,
	type Probe
} from './harness';

let probe: Probe;

beforeAll(async () => {
	probe = await openProbe();
}, 240_000);

afterAll(async () => {
	await probe?.close();
});

describe('landing page', () => {
	it('renders the hero and both calls to action', async () => {
		const { page, origin } = probe;
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		expect(await textOf(page.locator('h1'))).toContain('Turn any spreadsheet into a story');
		expect(await (page.getByRole('link', { name: /Upload a file/i }).first()).isVisible()).toBe(true);
		expect(await (page.getByRole('button', { name: /Try a sample dataset/i })).isVisible()).toBe(true);
	});

	it('states the privacy promise', async () => {
		const body = await bodyText(probe.page);
		expect(body).toContain('never leaves your device');
	});

	it('shows the static dashboard preview without loading the chart library', async () => {
		// The preview is hand-drawn SVG, so the landing page must have zero canvases.
		expect(await probe.page.locator('canvas').count()).toBe(0);
		expect(await probe.page.locator('svg').count()).toBeGreaterThan(5);
	});

	it('lists all four sample datasets', async () => {
		const body = await bodyText(probe.page);
		for (const name of ['Retail Sales', 'HR / Employees', 'Student Performance', 'Customer Churn']) {
			expect(body).toContain(name);
		}
	});
});

describe('upload and preview', () => {
	it('loads a sample and shows the typed preview table', async () => {
		const { page, origin } = probe;
		await loadSample(page, origin, 'sales');
		expect(await textOf(page.locator('h1'))).toContain('Retail Sales');

		const headers = await page.locator('table thead th').allInnerTexts();
		expect(headers.join(' ')).toContain('Order Date');
		expect(headers.join(' ')).toContain('Revenue');
		// Each header carries its detected type.
		expect(headers.join(' ').toLowerCase()).toContain('date');
		expect(headers.join(' ').toLowerCase()).toContain('number');
		expect(headers.join(' ').toLowerCase()).toContain('category');
	});

	it('caps the preview at 100 rows for a 6.5k-row file', async () => {
		const rows = await probe.page.locator('table tbody tr').count();
		expect(rows).toBe(100);
		expect(await textOf(probe.page.locator('body'))).toContain('6,561');
	});

	it('shows a health score and real quality findings', async () => {
		const body = await bodyText(probe.page);
		expect(body).toContain('Analysis health score');
		expect(body).toMatch(/\/ 100/);
		expect(body).toMatch(/duplicate row/i);
	});

	it('searches the whole dataset, not just the visible rows', async () => {
		const { page } = probe;
		await page.getByLabel('Search the table').fill('Mixer Grinder');
		await page.waitForTimeout(400);
		const rows = await page.locator('table tbody tr').count();
		expect(rows).toBeGreaterThan(0);
		expect(rows).toBeLessThanOrEqual(100);
		const first = await page.locator('table tbody tr').first().innerText();
		expect(first).toContain('Mixer Grinder');
		await page.getByLabel('Search the table').fill('');
		await page.waitForTimeout(300);
	});

	it('sorts by a clicked column', async () => {
		const { page } = probe;
		await page.getByTitle('Sort by Revenue').click();
		await page.waitForTimeout(400);
		const cells = await page.locator('table tbody tr td:nth-child(12)').allInnerTexts();
		const numbers = cells.map((c) => Number(c.replace(/[^\d.-]/g, ''))).filter(Number.isFinite);
		expect(numbers.length).toBeGreaterThan(5);
		// Ascending after the first click.
		expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
	});

	it('cleans the data and raises the score', async () => {
		const { page } = probe;
		// The score ring renders the number and "/ 100" as adjacent spans inside one div.
		const scoreOf = async () =>
			Number((await textOf(page.locator('svg + div').first())).match(/(\d+)/)?.[1] ?? '0');
		const before = await scoreOf();
		expect(before).toBeGreaterThan(0);

		await page.getByRole('button', { name: /Clean everything/i }).click();
		await page.waitForTimeout(3000);

		const after = await scoreOf();
		expect(after).toBeGreaterThanOrEqual(before);
		// The before/after log must appear.
		expect(await bodyText(page)).toContain('What was changed');
	});

	it('shows the before/after row count and score', async () => {
		// e.g. "6,561 -> 6,543 rows - health 93 -> 99"
		expect(await bodyText(probe.page)).toMatch(/[\d,]+ \u2192 [\d,]+ rows/);
	});

	it('reports what the cleaning actually did', async () => {
		const body = await bodyText(probe.page);
		expect(body).toMatch(/Removed \d+ duplicate row|Trimmed \d+ cells|Filled \d+ missing/);
	});
});

describe('dashboard', () => {
	it('builds charts and KPI cards from the cleaned data', async () => {
		const { page } = probe;
		await page.getByRole('button', { name: /Build my dashboard/i }).click();
		await page.waitForURL(/\/dashboard\//, { timeout: 30_000 });
		await waitForCharts(page, 4);

		// This journey already cleaned the data on the preview screen, so the
		// "may be misleading" prompt must NOT be showing.
		expect(await page.getByRole('button', { name: /Clean and rebuild/i }).count()).toBe(0);

		expect(await page.locator('canvas').count()).toBeGreaterThanOrEqual(4);
		const body = await bodyText(page);
		expect(body).toContain('Total Revenue');
		expect(body).toMatch(/Health \d+\/100/);
	});

	it('leads with a revenue trend over time', async () => {
		const titles = await probe.page.locator('section h3').allInnerTexts();
		expect(titles[0]).toMatch(/Revenue over time/i);
	});

	it('explains why each chart was chosen', async () => {
		// The subtitle carries its own text in `title` for the truncation tooltip.
		const reasons = await probe.page.locator('section p[title]').allInnerTexts();
		expect(reasons.length).toBeGreaterThan(3);
		for (const reason of reasons) expect(reason.length).toBeGreaterThan(15);
	});

	it('shows KPI values that are real numbers, not placeholders', async () => {
		const body = await bodyText(probe.page);
		expect(body).not.toMatch(/NaN|undefined|\[object/);
		// Currency KPI rendered with the default INR symbol.
		expect(body).toContain('₹');
	});

	it('cross-filters when a chart element is clicked', async () => {
		const { page } = probe;
		const card = page.locator('section:has(canvas)').filter({ hasText: /by Region/i }).first();
		// Must be on screen before clicking: an off-viewport canvas gives wrong coordinates.
		await card.scrollIntoViewIfNeeded();
		await page.waitForTimeout(400);

		const box = await card.locator('canvas').boundingBox();
		expect(box).not.toBeNull();

		// Try a few points down the tallest bar - exact plot geometry is ECharts' business.
		let applied = false;
		for (const [fx, fy] of [
			[0.2, 0.75],
			[0.15, 0.6],
			[0.12, 0.85],
			[0.25, 0.7]
		]) {
			await page.mouse.click(box!.x + box!.width * fx, box!.y + box!.height * fy);
			await page.waitForTimeout(1000);
			if (await page.getByRole('button', { name: /Clear all/i }).count()) {
				applied = true;
				break;
			}
		}

		expect(applied, 'clicking a bar should set a cross-filter').toBe(true);
		// The chip names the column and the clicked value.
		const chip = await textOf(page.locator('button').filter({ hasText: 'Region:' }));
		expect(chip).toMatch(/Region:\s*\w+/);
		expect(await bodyText(page)).toMatch(/of [\d,]+ rows/);

		// Clicking the chip clears it again.
		await page.locator('button').filter({ hasText: 'Region:' }).first().click();
		await page.waitForTimeout(1200);
		expect(await page.locator('button').filter({ hasText: 'Region:' }).count()).toBe(0);
	});

	it('filters every chart and KPI from a global slicer', async () => {
		const { page } = probe;
		await page.locator('button').filter({ hasText: 'Region' }).first().click();
		await page.waitForTimeout(400);
		await page
			.locator('label:has(input[type=checkbox])')
			.filter({ hasText: 'North' })
			.first()
			.click();
		await page.keyboard.press('Escape');
		await page.waitForTimeout(1500);

		expect(await bodyText(page)).toMatch(/of [\d,]+ rows/);
		expect(await page.getByRole('button', { name: /Clear all/i }).count()).toBe(1);
	});

	it('clears all filters', async () => {
		const { page } = probe;
		await page.getByRole('button', { name: /Clear all/i }).click();
		await page.waitForTimeout(1200);
		expect(await page.getByRole('button', { name: /Clear all/i }).count()).toBe(0);
	});

	it('changes a chart type from the card menu', async () => {
		const { page } = probe;
		await page.getByRole('button', { name: /Clear all/i }).click().catch(() => {});
		await page.waitForTimeout(600);

		// Find a card whose type menu offers Bar (the trend card does not).
		const card = page.locator('section:has(canvas)').filter({ hasText: /by Region/i }).first();
		await card.scrollIntoViewIfNeeded();
		await card.hover();
		await card.getByRole('button', { name: 'Chart options' }).click({ force: true });
		await page.waitForTimeout(400);
		await page.getByRole('button', { name: /^Horizontal bar$/ }).first().click();
		await page.waitForTimeout(1200);
		// Still rendering after the swap.
		expect(await page.locator('canvas').count()).toBeGreaterThan(3);
	});

	it('hides and restores a card', async () => {
		const { page } = probe;
		const before = await page.locator('section:has(canvas)').count();

		const card = page.locator('section:has(canvas)').first();
		const hiddenTitle = await card.locator('h3').innerText();
		await card.scrollIntoViewIfNeeded();
		await card.hover();
		await card.getByRole('button', { name: 'Chart options' }).click({ force: true });
		await page.waitForTimeout(400);
		await page.getByRole('button', { name: /^Hide$/ }).click();
		await page.waitForTimeout(900);

		expect(await page.locator('section:has(canvas)').count()).toBe(before - 1);
		expect(await textOf(page.locator('body'))).toContain('Hidden charts');

		// Restore it from the "Hidden charts" row.
		await page
			.locator('div:has(> p) button')
			.filter({ hasText: hiddenTitle })
			.first()
			.click();
		await page.waitForTimeout(1200);
		expect(await page.locator('section:has(canvas)').count()).toBe(before);
	});
});

describe('story panel', () => {
	it('writes insights with real numbers from the data', async () => {
		const { page } = probe;
		// In-app navigation: a full page load would discard the in-memory dataset, which is
		// correct product behaviour (nothing is persisted until you save).
		await page.locator('header nav a', { hasText: 'Story' }).first().click();
		await page.waitForURL(/\/story\//, { timeout: 20_000 });
		await page.waitForSelector('li.card', { timeout: 30_000 });

		const items = await page.locator('li.card').allInnerTexts();
		expect(items.length).toBeGreaterThanOrEqual(5);
		const all = items.join(' ');
		expect(all).not.toMatch(/NaN|undefined|\[object|lorem/i);
		// Percentages and real column names, not generic filler.
		expect(all).toMatch(/\d+\.\d%/);
		expect(all).toMatch(/Revenue|Region|Category/);
	});

	it('does not claim the partial final month collapsed', async () => {
		const body = await bodyText(probe.page);
		expect(body).toContain('The last month is incomplete');
		expect(body).not.toMatch(/Sharp drop in Jul 2025/);
	});

	it('filters findings by severity', async () => {
		const { page } = probe;
		const all = await page.locator('li.card').count();
		await page.getByRole('button', { name: /Warnings/ }).click();
		await page.waitForTimeout(400);
		const warnings = await page.locator('li.card').count();
		expect(warnings).toBeGreaterThan(0);
		expect(warnings).toBeLessThanOrEqual(all);
		await page.getByRole('button', { name: /All findings/ }).click();
		await page.waitForTimeout(400);
	});

	it('copies the insights to the clipboard', async () => {
		const { page, origin } = probe;
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
		await page.getByRole('button', { name: /Copy insights/i }).click();
		await page.waitForTimeout(600);
		const text = await page.evaluate(() => navigator.clipboard.readText());
		expect(text).toContain('DataStory insights');
		expect(text).toMatch(/\[(INFO|WARNING|HIGHLIGHT)\]/);
	});
});

describe('chart builder', () => {
	it('previews and adds a custom chart', async () => {
		const { page } = probe;
		await page.locator('header nav a', { hasText: 'Build chart' }).first().click();
		await page.waitForURL(/\/builder\//, { timeout: 20_000 });
		await waitForCharts(page, 1);

		const before = await page.locator('canvas').count();
		expect(before).toBeGreaterThan(0);

		// Switch to a donut and confirm the preview survives.
		await page.getByRole('button', { name: 'Donut' }).click();
		await page.waitForTimeout(900);
		expect(await page.locator('canvas').count()).toBeGreaterThan(0);

		await page.getByRole('button', { name: /Add to dashboard/i }).click();
		await page.waitForURL(/\/dashboard\//, { timeout: 30_000 });
		await waitForCharts(page, 4);
		expect(await textOf(page.locator('body'))).toContain('Built by hand in the chart builder');
	});
});

describe('save, reopen and export', () => {
	it('saves the dashboard and lists it', async () => {
		const { page } = probe;
		await page.locator('header a', { hasText: 'Export' }).first().click();
		await page.waitForURL(/\/export\//, { timeout: 20_000 });
		await page.waitForSelector('input', { timeout: 30_000 });

		await page.locator('input').first().fill('Q2 Sales Review');
		await page.getByRole('button', { name: /^Save$/ }).click();
		await page.waitForTimeout(1200);

		await page.locator('header nav a', { hasText: 'My dashboards' }).first().click();
		await page.waitForURL(/\/dashboards\//, { timeout: 20_000 });
		expect(await bodyText(page)).toContain('Q2 Sales Review');
		// The thumbnail is inline SVG, so it renders with no extra request.
		expect(await page.locator('article svg').count()).toBeGreaterThan(0);
	});

	it('reopens a saved dashboard with its charts intact', async () => {
		const { page } = probe;
		await page.getByRole('button', { name: /^Open$/ }).first().click();
		await page.waitForURL(/\/dashboard\//, { timeout: 30_000 });
		await waitForCharts(page, 4);
		expect(await textOf(page.locator('h1'))).toContain('Q2 Sales Review');
	});

	it('duplicates a saved dashboard', async () => {
		const { page } = probe;
		await page.locator('header nav a', { hasText: 'My dashboards' }).first().click();
		await page.waitForURL(/\/dashboards\//, { timeout: 20_000 });
		await page.getByRole('button', { name: /Duplicate/i }).first().click();
		await page.waitForTimeout(800);
		expect(await textOf(page.locator('body'))).toContain('(copy)');
	});

	it('deletes a saved dashboard after confirming', async () => {
		const { page } = probe;
		const before = await page.locator('article').count();
		await page.getByRole('button', { name: /^Delete/i }).first().click();
		await page.waitForTimeout(400);
		await page.getByRole('button', { name: /^Delete$/ }).last().click();
		await page.waitForTimeout(800);
		expect(await page.locator('article').count()).toBe(before - 1);
	});

	it('downloads the cleaned CSV with real rows', async () => {
		const { page } = probe;
		await page.locator('header nav a', { hasText: 'My dashboards' }).first().click();
		await page.waitForURL(/\/dashboards\//, { timeout: 20_000 });
		await page.getByRole('button', { name: /^Open$/ }).first().click();
		await page.waitForURL(/\/dashboard\//, { timeout: 30_000 });
		await waitForCharts(page, 3);
		await page.locator('header a', { hasText: 'Export' }).first().click();
		await page.waitForURL(/\/export\//, { timeout: 20_000 });

		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 60_000 }),
			page
				.locator('div.card')
				.filter({ hasText: 'Export cleaned data as CSV' })
				.getByRole('button', { name: /Download/i })
				.first()
				.click()
		]);
		expect(download.suggestedFilename()).toMatch(/\.csv$/);
		const stream = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream) chunks.push(chunk as Buffer);
		const csv = Buffer.concat(chunks).toString('utf8');
		const lines = csv.trim().split(/\r?\n/);
		expect(lines.length).toBeGreaterThan(1000);
		expect(lines[0]).toContain('Revenue');
	});

	it('exports a PDF report', async () => {
		const { page } = probe;
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 120_000 }),
			page
				.locator('div.card')
				.filter({ hasText: 'Export as PDF' })
				.getByRole('button', { name: /Download/i })
				.first()
				.click()
		]);
		expect(download.suggestedFilename()).toMatch(/\.pdf$/);
		const stream = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream) chunks.push(chunk as Buffer);
		const pdf = Buffer.concat(chunks);
		// Real PDF, with enough content to be a report rather than a stub.
		expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
		expect(pdf.length).toBeGreaterThan(20_000);
	});

	it('exports a dashboard PNG', async () => {
		const { page } = probe;
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 120_000 }),
			page
				.locator('div.card')
				.filter({ hasText: 'Export dashboard as PNG' })
				.getByRole('button', { name: /Download/i })
				.first()
				.click()
		]);
		expect(download.suggestedFilename()).toMatch(/\.png$/);
		const stream = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream) chunks.push(chunk as Buffer);
		const png = Buffer.concat(chunks);
		expect(png.subarray(1, 4).toString()).toBe('PNG');
		expect(png.length).toBeGreaterThan(30_000);
	});
});

describe('settings and theme', () => {
	it('switches to dark mode and keeps charts readable', async () => {
		const { page } = probe;
		await page.locator('header nav a', { hasText: 'Dashboard' }).first().click();
		await page.waitForURL(/\/dashboard\//, { timeout: 20_000 });
		await waitForCharts(page, 3);

		await page.getByRole('button', { name: /Switch to dark mode/i }).click();
		await page.waitForTimeout(900);
		expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
		// Charts re-render under the dark palette rather than disappearing.
		expect(await page.locator('canvas').count()).toBeGreaterThanOrEqual(4);
	});

	it('persists the theme across a reload', async () => {
		const { page } = probe;
		await page.reload({ waitUntil: 'load' });
		await page.waitForTimeout(500);
		expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
		await page.getByRole('button', { name: /Switch to light mode/i }).click();
		await page.waitForTimeout(600);
	});

	it('changes the currency and number format', async () => {
		const { page, origin } = probe;
		await page.goto(`${origin}/settings/`, { waitUntil: 'load' });
		await page.getByRole('button', { name: '$', exact: true }).click();
		await page.getByRole('radio', { name: /Indian/ }).check();
		await page.waitForTimeout(400);
		// The live preview reflects both choices.
		expect(await textOf(page.locator('body'))).toContain('$');
		expect(await textOf(page.locator('body'))).toContain('12,34,567');
	});

	it('applies the new format on the dashboard', async () => {
		const { page, origin } = probe;
		await ensureDashboard(page, origin);
		const body = await bodyText(page);
		expect(body).toContain('$');
		expect(body).not.toContain('₹');
	});

	it('changes the chart palette', async () => {
		const { page, origin } = probe;
		await page.goto(`${origin}/settings/`, { waitUntil: 'load' });
		await page.getByRole('button', { name: /Ocean/ }).click();
		await ensureDashboard(page, origin);
		expect(await page.locator('canvas').count()).toBeGreaterThanOrEqual(4);
	});
});

describe('keyboard shortcuts', () => {
	it('navigates with single keys', async () => {
		const { page, origin } = probe;
		await ensureDashboard(page, origin);

		await page.keyboard.press('s');
		await page.waitForURL(/\/story\//, { timeout: 15_000 });

		await page.keyboard.press('p');
		await page.waitForURL(/\/preview\//, { timeout: 15_000 });

		await page.keyboard.press('d');
		await page.waitForURL(/\/dashboard\//, { timeout: 15_000 });
	});

	it('opens the shortcut overlay with ?', async () => {
		const { page } = probe;
		await page.keyboard.press('?');
		await page.waitForTimeout(400);
		expect(await textOf(page.getByRole('dialog'))).toContain('Keyboard shortcuts');
		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);
	});

	it('toggles the theme with T', async () => {
		const { page } = probe;
		const before = await page.evaluate(() => document.documentElement.classList.contains('dark'));
		await page.keyboard.press('t');
		await page.waitForTimeout(500);
		const after = await page.evaluate(() => document.documentElement.classList.contains('dark'));
		expect(after).toBe(!before);
	});
});

describe('every sample dataset works', () => {
	for (const id of ['hr', 'students', 'churn']) {
		it(`builds a full dashboard for "${id}"`, async () => {
			const { page, origin } = probe;
			await loadSample(page, origin, id);
			await page.getByRole('button', { name: /Build dashboard/i }).click();
			await page.waitForURL(/\/dashboard\//, { timeout: 30_000 });
			await waitForCharts(page, 3);
			// Uncleaned samples raise the "may be misleading" prompt - take the offered fix.
			if (await page.getByRole('button', { name: /Clean and rebuild/i }).count()) {
				await page.getByRole('button', { name: /Clean and rebuild/i }).click();
				await waitForCharts(page, 3);
			}

			expect(await page.locator('canvas').count()).toBeGreaterThanOrEqual(3);
			const body = await bodyText(page);
			expect(body).not.toMatch(/NaN|undefined|\[object/);

			await page.locator('header nav a', { hasText: 'Story' }).first().click();
			await page.waitForURL(/\/story\//, { timeout: 20_000 });
			await page.waitForSelector('li.card', { timeout: 30_000 });
			expect(await page.locator('li.card').count()).toBeGreaterThanOrEqual(4);
		});
	}
});

describe('error handling', () => {
	it('explains an unsupported file instead of failing silently', async () => {
		const { page, origin } = probe;
		await page.goto(`${origin}/upload/`, { waitUntil: 'load' });
		await page.locator('input[type=file]').setInputFiles({
			name: 'photo.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('%PDF-1.4 not a spreadsheet')
		});
		await page.waitForTimeout(800);
		const alert = await page.getByRole('alert').innerText();
		expect(alert).toContain('.pdf');
		expect(alert).toMatch(/Supported formats/i);
	});

	it('explains an empty file', async () => {
		const { page } = probe;
		await page.locator('input[type=file]').setInputFiles({
			name: 'empty.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from('')
		});
		await page.waitForTimeout(800);
		expect(await page.getByRole('alert').innerText()).toMatch(/empty/i);
	});

	it('explains a header-only CSV', async () => {
		const { page } = probe;
		await page.locator('input[type=file]').setInputFiles({
			name: 'headers.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from('Region,Revenue\n')
		});
		await page.waitForTimeout(1200);
		expect(await page.getByRole('alert').innerText()).toMatch(/no data rows/i);
	});

	it('accepts a genuine uploaded CSV and analyses it', async () => {
		const { page } = probe;
		const rows = ['Month,Store,Sales,Units'];
		for (let i = 0; i < 120; i++) {
			const month = `2024-${String((i % 12) + 1).padStart(2, '0')}-15`;
			rows.push(`${month},Store ${(i % 4) + 1},${1000 + i * 25},${10 + (i % 17)}`);
		}
		await page.locator('input[type=file]').setInputFiles({
			name: 'store-sales.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(rows.join('\n'))
		});
		await page.waitForURL(/\/preview\//, { timeout: 30_000 });
		await page.waitForSelector('table thead th', { timeout: 30_000 });

		expect(await textOf(page.locator('h1'))).toContain('store-sales');
		await page.getByRole('button', { name: /Build dashboard/i }).click();
		await page.waitForURL(/\/dashboard\//, { timeout: 30_000 });
		await waitForCharts(page, 3);
		expect(await page.locator('canvas').count()).toBeGreaterThanOrEqual(3);
	});
});

describe('responsive layout', () => {
	it('works at mobile width', async () => {
		const { page, origin } = probe;
		await page.setViewportSize({ width: 390, height: 844 });
		await ensureDashboard(page, origin);

		// No horizontal overflow on a phone.
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(2);

		// The mobile menu replaces the desktop nav.
		await page.getByRole('button', { name: 'Menu' }).click();
		await page.waitForTimeout(300);
		expect(await (page.locator('nav[aria-label="Mobile"]')).isVisible()).toBe(true);
		await page.setViewportSize({ width: 1440, height: 900 });
	});
});

/**
 * Static-host routing. These are the deploy-shape checks: on Vercel every unmatched path is
 * rewritten to the SPA fallback, so a refresh on a deep link must boot the app rather than
 * 404, and the real files (hashed assets, sample CSVs) must still win over that rewrite.
 */
describe('static hosting and deep links', () => {
	for (const path of [
		'/upload/',
		'/dashboard/',
		'/story/',
		'/builder/',
		'/export/',
		'/dashboards/',
		'/settings/',
		'/help/'
	]) {
		it(`serves ${path} directly without a 404`, async () => {
			const { page, origin } = probe;
			const response = await page.goto(`${origin}${path}`, { waitUntil: 'load' });
			expect(response?.status()).toBe(200);
			// The shell must actually hydrate, not just return HTML.
			await page.waitForSelector('header', { timeout: 30_000 });
			expect(await page.locator('header').count()).toBeGreaterThan(0);
		});
	}

	it('boots the app from an unknown deep link via the fallback', async () => {
		const { page, origin } = probe;
		const response = await page.goto(`${origin}/dashboard/some/deep/link/`, {
			waitUntil: 'load'
		});
		expect(response?.status()).toBe(200);
		await page.waitForSelector('header', { timeout: 30_000 });
	});

	it('serves the sample CSVs as real files, not the HTML fallback', async () => {
		const { page, origin } = probe;
		for (const file of [
			'sales.csv',
			'hr-employees.csv',
			'student-performance.csv',
			'customer-churn.csv'
		]) {
			const res = await page.request.get(`${origin}/samples/${file}`);
			expect(res.status(), file).toBe(200);
			const body = await res.text();
			// A rewrite bug would return index.html here and the parser would see markup.
			expect(body.startsWith('<!doctype'), `${file} returned HTML`).toBe(false);
			expect(body.split('\n')[0]).toMatch(/,/);
		}
	});

	it('serves every hashed JS and CSS asset the page asks for', async () => {
		const { page, origin } = probe;
		await page.goto(`${origin}/`, { waitUntil: 'load' });
		// Resolve against the document URL: prerendered pages legitimately use relative
		// hrefs, so string-concatenating them onto the origin would build a broken URL.
		const assets = await page.evaluate(() =>
			[...document.querySelectorAll('link[rel=modulepreload], link[rel=stylesheet]')]
				.map((el) => (el as HTMLLinkElement).href)
				.filter(Boolean)
		);
		expect(assets.length).toBeGreaterThan(5);
		for (const url of assets.slice(0, 10)) {
			const res = await page.request.get(url);
			expect(res.status(), url).toBe(200);
			expect((await res.text()).startsWith('<!doctype'), url).toBe(false);
		}
	});

	/**
	 * The fallback is served at arbitrary depths (/dashboard/, /a/b/c/), so its asset paths
	 * MUST be root-absolute. Prerendered pages are served only from their own known depth,
	 * so their relative paths are fine - and are verified above by resolving them for real.
	 */
	it('ships a fallback whose asset paths are root-absolute', async () => {
		const { page, origin } = probe;
		const res = await page.request.get(`${origin}/200.html`);
		expect(res.status()).toBe(200);
		const html = await res.text();
		const hrefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
			.map((m) => m[1])
			.filter((h) => h.includes('_app/'));
		expect(hrefs.length).toBeGreaterThan(5);
		for (const href of hrefs) expect(href.startsWith('/_app/'), href).toBe(true);
	});

	it('loads assets correctly when a deep link is served by the fallback', async () => {
		const { page, origin } = probe;
		const failed: string[] = [];
		const onFailed = (req: { url(): string }) => failed.push(req.url());
		page.on('requestfailed', onFailed);

		const res = await page.goto(`${origin}/dashboard/deep/unknown/`, { waitUntil: 'load' });
		expect(res?.status()).toBe(200);
		await page.waitForSelector('header', { timeout: 30_000 });
		await page.waitForLoadState('networkidle');
		page.off('requestfailed', onFailed);

		// Every asset must have resolved from three levels deep.
		expect(failed.filter((u) => u.includes('_app/')), failed.join('\n')).toEqual([]);
	});
});

describe('runtime cleanliness', () => {
	it('ran the whole journey without console errors', () => {
		// Downloads in headless Chrome can log a benign net::ERR_ABORTED for the blob URL.
		const real = probe.errors.filter(
			(e) => !/ERR_ABORTED|Download is starting|favicon/i.test(e)
		);
		expect(real, real.join('\n')).toEqual([]);
	});
});
