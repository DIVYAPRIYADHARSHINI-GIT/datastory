/**
 * Shared harness for the headless-Chrome probes.
 *
 * Builds the static site once, serves `build/` over a plain Node static server (which is
 * exactly how the app is deployed), and hands out a Playwright page. Console errors and
 * page exceptions are collected so a probe can assert the app ran clean, not just that the
 * DOM looked right.
 */

import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, type Browser, type ConsoleMessage, type Locator, type Page } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const BUILD_DIR = join(ROOT, 'build');

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.csv': 'text/csv; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff'
};

export function buildSite(): void {
	if (!existsSync(join(BUILD_DIR, 'index.html'))) {
		execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe' });
	}
}

/** Static server with SPA fallback, matching a GitHub Pages / Netlify style host. */
export async function startServer(): Promise<{ origin: string; close: () => Promise<void> }> {
	const server: Server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		let path = decodeURIComponent(url.pathname);
		if (path.endsWith('/')) path += 'index.html';

		// Mirror Vercel exactly: serve a real file when one exists, otherwise rewrite to the
		// SPA fallback. Falling back to `index.html` here would hide fallback-only bugs,
		// because index.html is the prerendered landing page and happens to boot fine.
		let filePath = join(BUILD_DIR, normalize(path).replace(/^(\.\.[/\\])+/, ''));
		let status = 200;
		if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
			const htmlPath = `${filePath}.html`;
			if (existsSync(htmlPath)) {
				filePath = htmlPath;
			} else {
				// Unknown asset extensions must 404 rather than return HTML, so a missing
				// sample CSV surfaces as a failed fetch instead of silently parsing markup.
				const ext = extname(filePath);
				if (ext && ext !== '.html') {
					res.writeHead(404, { 'Content-Type': 'text/plain' });
					res.end('Not found');
					return;
				}
				filePath = join(BUILD_DIR, '200.html');
				status = 200;
			}
		}

		res.writeHead(status, {
			'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
			'Cache-Control': 'no-store'
		});
		createReadStream(filePath).pipe(res);
	});

	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;

	return {
		origin: `http://127.0.0.1:${port}`,
		close: () => new Promise<void>((done) => server.close(() => done()))
	};
}

export type Probe = {
	page: Page;
	origin: string;
	errors: string[];
	
	close: () => Promise<void>;
};

export async function openProbe(): Promise<Probe> {
	buildSite();
	const { origin, close: closeServer } = await startServer();
	const browser: Browser = await chromium.launch();
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();

	const errors: string[] = [];
	page.on('console', (msg: ConsoleMessage) => {
		if (msg.type() === 'error') errors.push(msg.text());
	});
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

	return {
		page,
		origin,
		errors,
		close: async () => {
			await browser.close();
			await closeServer();
		}
	};
}

/**
 * Text of a locator, waiting for it to exist first.
 * Vitest's `expect` has no Playwright matchers, so probes assert on strings instead.
 */
export async function textOf(locator: Locator): Promise<string> {
	await locator.first().waitFor({ state: 'attached', timeout: 30_000 });
	return (await locator.first().innerText()).trim();
}

/**
 * Whole-page text, after hydration has had a chance to run.
 *
 * `textContent` rather than `innerText`: CSS `text-transform: uppercase` is baked into
 * innerText, so a heading styled uppercase would never match the sentence case in the
 * source. textContent gives the real authored text.
 */
export async function bodyText(page: Page): Promise<string> {
	await page.waitForLoadState('networkidle');
	// Skip <script>/<style>: body.textContent otherwise returns the inline no-flash theme
	// script from app.html instead of the visible copy.
	return page.evaluate(() => {
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

/** Wait for the dashboard's charts to finish drawing. */
export async function waitForCharts(page: Page, min = 1): Promise<void> {
	await page.waitForFunction(
		(n) => document.querySelectorAll('canvas').length >= n,
		min,
		{ timeout: 60_000 }
	);
	// ECharts draws on the next frame after mount.
	await page.waitForTimeout(600);
}

/** Load a built-in sample and land on the data preview screen. */
export async function loadSample(page: Page, origin: string, id: string): Promise<void> {
	await page.goto(`${origin}/upload/?sample=${id}`, { waitUntil: 'load' });
	await page.waitForSelector('table thead th', { timeout: 60_000 });
}

/**
 * Get to a working dashboard, reloading the sample when the in-memory dataset is gone.
 *
 * A hard `page.goto` discards the dataset by design - DataStory holds the parsed file in
 * memory and persists nothing until you save - so any probe that navigates by URL has to
 * re-establish state rather than assume it survived.
 */
export async function ensureDashboard(
	page: Page,
	origin: string,
	id = 'sales'
): Promise<void> {
	if (!/\/dashboard\//.test(page.url()) || (await page.locator('canvas').count()) === 0) {
		await loadSample(page, origin, id);
		await page.getByRole('button', { name: /Build dashboard/i }).click();
		await page.waitForURL(/\/dashboard\//, { timeout: 30_000 });
	}
	await waitForCharts(page, 3);
}
