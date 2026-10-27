/**
 * Live-site probe: drives the deployed production URL in headless Chrome.
 *
 * The e2e probe proves the build works when served locally; this proves the DEPLOYMENT
 * works - Vercel's rewrites, asset caching, sample-CSV delivery and SPA fallback included.
 * It touches nothing local, so it can be pointed at any environment:
 *
 *   DATASTORY_URL=https://datastory.vercel.app npx vitest run --config probes/vitest.probe.config.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const BASE = (process.env.DATASTORY_URL ?? 'https://datastory.vercel.app').replace(/\/$/, '');

let browser: Browser;
let page: Page;
const errors: string[] = [];

beforeAll(async () => {
	browser = await chromium.launch();
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	page = await context.newPage();
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
}, 120_000);

afterAll(async () => {
	await browser?.close();
});

async function bodyText(target: Page): Promise<string> {
	await target.waitForLoadState('networkidle');
	return target.evaluate(() => {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const tag = node.parentElement?.tagName;
				return tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE'
					? NodeFilter.FILTER_REJECT
					: NodeFilter.FILTER_ACCEPT;
			}
		});
		const parts: string[] = [];
		while (walker.nextNode()) parts.push(walker.currentNode.nodeValue ?? '');
		return parts.join(' ').replace(/\s+/g, ' ');
	});
}

async function waitForCharts(target: Page, min: number): Promise<void> {
	await target.waitForFunction((n) => document.querySelectorAll('canvas').length >= n, min, {
		timeout: 90_000
	});
	await target.waitForTimeout(800);
}

describe('live: landing page', () => {
	it('loads over HTTPS and renders the hero', async () => {
		const res = await page.goto(`${BASE}/`, { waitUntil: 'load' });
		expect(res?.status()).toBe(200);
		expect(new URL(page.url()).protocol).toBe('https:');
		expect(await page.locator('h1').first().innerText()).toContain(
			'Turn any spreadsheet into a story'
		);
	});

	it('states the privacy promise and lists the samples', async () => {
		const text = await bodyText(page);
		expect(text).toContain('never leaves your device');
		for (const name of ['Retail Sales', 'HR / Employees', 'Student Performance', 'Customer Churn']) {
			expect(text).toContain(name);
		}
	});

	it('loads every CSS and JS asset it references', async () => {
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
});

describe('live: SPA routing', () => {
	for (const path of ['/upload/', '/dashboard/', '/story/', '/builder/', '/export/', '/dashboards/', '/settings/', '/help/']) {
		it(`refresh on ${path} does not 404`, async () => {
			const res = await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
			expect(res?.status()).toBe(200);
			await page.waitForSelector('header', { timeout: 60_000 });
		});
	}

	it('an unknown deep link still boots the app with working assets', async () => {
		const failed: string[] = [];
		const onFailed = (req: { url(): string }) => failed.push(req.url());
		page.on('requestfailed', onFailed);

		const res = await page.goto(`${BASE}/dashboard/deep/unknown/`, { waitUntil: 'load' });
		expect(res?.status()).toBe(200);
		await page.waitForSelector('header', { timeout: 60_000 });
		await page.waitForLoadState('networkidle');
		page.off('requestfailed', onFailed);

		expect(failed.filter((u) => u.includes('_app/')), failed.join('\n')).toEqual([]);
	});
});

describe('live: sample dataset end to end', () => {
	it('loads the Retail Sales sample and types its columns', async () => {
		await page.goto(`${BASE}/upload/?sample=sales`, { waitUntil: 'load' });
		await page.waitForSelector('table thead th', { timeout: 90_000 });

		const headers = (await page.locator('table thead th').allInnerTexts()).join(' ');
		expect(headers).toContain('Order Date');
		expect(headers).toContain('Revenue');
		expect(headers.toLowerCase()).toContain('date');
		expect(headers.toLowerCase()).toContain('number');
		// 6,561 rows must have actually arrived over the network.
		expect(await bodyText(page)).toContain('6,561');
	});

	it('builds a dashboard with charts and real KPI values', async () => {
		await page.getByRole('button', { name: /Build dashboard/i }).click();
		await page.waitForURL(/\/dashboard\//, { timeout: 60_000 });
		await waitForCharts(page, 4);

		expect(await page.locator('canvas').count()).toBeGreaterThanOrEqual(4);
		const text = await bodyText(page);
		expect(text).toMatch(/Total Revenue/i);
		expect(text).not.toMatch(/NaN|undefined|\[object/);
		expect(text).toContain('₹');
	});

	it('cross-filters when a chart bar is clicked', async () => {
		const card = page.locator('section:has(canvas)').filter({ hasText: /by Region/i }).first();
		await card.scrollIntoViewIfNeeded();
		await page.waitForTimeout(500);
		const box = await card.locator('canvas').boundingBox();
		expect(box).not.toBeNull();

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
		expect(applied, 'clicking a bar should cross-filter the dashboard').toBe(true);
		expect(await bodyText(page)).toMatch(/of [\d,]+ rows/);

		await page.getByRole('button', { name: /Clear all/i }).click();
		await page.waitForTimeout(1000);
	});

	it('writes insights with real numbers', async () => {
		await page.locator('header nav a', { hasText: 'Story' }).first().click();
		await page.waitForURL(/\/story\//, { timeout: 60_000 });
		await page.waitForSelector('li.card', { timeout: 60_000 });

		expect(await page.locator('li.card').count()).toBeGreaterThanOrEqual(5);
		const text = await bodyText(page);
		expect(text).not.toMatch(/NaN|undefined|\[object|lorem/i);
		expect(text).toMatch(/\d+\.\d%/);
		// The partial-final-period guard must hold on the live data too.
		expect(text).toContain('The last month is incomplete');
	});
});

describe('live: CSV upload', () => {
	it('accepts an uploaded CSV and charts it', async () => {
		await page.goto(`${BASE}/upload/`, { waitUntil: 'load' });
		// The file input is intentionally `display:none` behind a styled drop zone, so wait
		// for it to be ATTACHED (not visible) and drive the real user path: clicking the
		// drop zone opens the browser's file chooser.
		await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 60_000 });

		const rows = ['Month,Store,Sales,Units'];
		for (let i = 0; i < 120; i++) {
			const month = `2024-${String((i % 12) + 1).padStart(2, '0')}-15`;
			rows.push(`${month},Store ${(i % 4) + 1},${1000 + i * 25},${10 + (i % 17)}`);
		}

		const [chooser] = await Promise.all([
			page.waitForEvent('filechooser', { timeout: 30_000 }),
			page.getByRole('button', { name: /Drop a CSV or Excel file/i }).click()
		]);
		await chooser.setFiles({
			name: 'store-sales.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(rows.join('\n'))
		});

		await page.waitForURL(/\/preview\//, { timeout: 90_000 });
		await page.waitForSelector('table thead th', { timeout: 60_000 });
		expect(await page.locator('h1').first().innerText()).toContain('store-sales');

		await page.getByRole('button', { name: /Build dashboard/i }).click();
		await page.waitForURL(/\/dashboard\//, { timeout: 60_000 });
		await waitForCharts(page, 3);
		expect(await page.locator('canvas').count()).toBeGreaterThanOrEqual(3);
	});

	it('rejects an unsupported file with a clear message', async () => {
		await page.goto(`${BASE}/upload/`, { waitUntil: 'load' });
		await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 60_000 });
		const [chooser] = await Promise.all([
			page.waitForEvent('filechooser', { timeout: 30_000 }),
			page.getByRole('button', { name: /Drop a CSV or Excel file/i }).click()
		]);
		await chooser.setFiles({
			name: 'photo.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('%PDF-1.4 not a spreadsheet')
		});
		await page.waitForTimeout(1500);
		const alert = await page.getByRole('alert').innerText();
		expect(alert).toContain('.pdf');
		expect(alert).toMatch(/Supported formats/i);
	});
});

describe('live: theme and responsiveness', () => {
	it('toggles dark mode and keeps charts rendered', async () => {
		await page.goto(`${BASE}/upload/?sample=churn`, { waitUntil: 'load' });
		await page.waitForSelector('table thead th', { timeout: 90_000 });
		await page.getByRole('button', { name: /Build dashboard/i }).click();
		await page.waitForURL(/\/dashboard\//, { timeout: 60_000 });
		await waitForCharts(page, 3);

		await page.getByRole('button', { name: /Switch to dark mode/i }).click();
		await page.waitForTimeout(1000);
		expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
			true
		);
		expect(await page.locator('canvas').count()).toBeGreaterThanOrEqual(3);
	});

	it('persists the theme across a hard reload', async () => {
		await page.reload({ waitUntil: 'load' });
		await page.waitForTimeout(800);
		expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
			true
		);
		await page.getByRole('button', { name: /Switch to light mode/i }).click();
		await page.waitForTimeout(800);
	});

	it('has no horizontal overflow at 390px on any page', async () => {
		await page.setViewportSize({ width: 390, height: 844 });
		for (const path of ['/', '/upload/', '/help/', '/settings/', '/dashboards/']) {
			await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
			await page.waitForTimeout(900);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(2);
		}
		await page.setViewportSize({ width: 1440, height: 900 });
	});
});

describe('live: runtime cleanliness', () => {
	it('produced no console errors across the whole live journey', () => {
		const real = errors.filter((e) => !/ERR_ABORTED|Download is starting|favicon/i.test(e));
		expect(real, real.join('\n')).toEqual([]);
	});
});
