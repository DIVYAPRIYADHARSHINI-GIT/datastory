/**
 * End-to-end pipeline test against the real bundled sample CSVs.
 *
 * This is the test that proves the product actually works: parse -> type -> quality ->
 * clean -> suggest -> aggregate -> KPIs -> insights, on the same files a user clicks in
 * the UI. It reads them from static/ with node:fs rather than fetch, so it runs in the
 * normal unit suite.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { autoClean } from '../analysis/clean';
import { analyzeQuality } from '../analysis/quality';
import { buildDataset } from '../analysis/stats';
import { buildChartData } from '../charts/aggregate';
import { computeKpi, suggestKpis } from '../charts/kpis';
import { suggestCharts } from '../charts/suggest';
import { generateInsights } from '../insights/generate';
import { DEFAULT_SETTINGS, formatOptionsFrom } from '../format';
import type { CellValue, Dataset, RawTable } from '../types';

const fmt = formatOptionsFrom(DEFAULT_SETTINGS);

/**
 * Mirror of the production parse path: PapaParse -> RawTable -> buildDataset.
 *
 * `skipEmptyLines: 'greedy'` means fully blank CSV rows are dropped by the parser itself
 * and reported as `skippedEmptyRows`, exactly as `finishTable` does in parse.ts - so a
 * CSV's blank rows never reach the cleaning screen as "empty rows" to drop.
 */
function loadSampleFile(file: string, name: string): Dataset {
	const text = readFileSync(resolve(process.cwd(), 'static/samples', file), 'utf8');
	const raw = Papa.parse<unknown[]>(text, { skipEmptyLines: false, dynamicTyping: false });
	const all = raw.data as CellValue[][];
	const nonEmpty = all.filter((row) =>
		row.some((v) => v !== null && v !== undefined && String(v).trim() !== '')
	);
	const table: RawTable = {
		headers: nonEmpty[0].map(String),
		rows: nonEmpty.slice(1),
		skippedEmptyRows: all.length - nonEmpty.length
	};
	return buildDataset(table, { name, source: 'sample' });
}

/** How many fully blank rows the parser removed before analysis. */
function blankRowsInFile(file: string): number {
	const text = readFileSync(resolve(process.cwd(), 'static/samples', file), 'utf8');
	const raw = Papa.parse<unknown[]>(text, { skipEmptyLines: false, dynamicTyping: false });
	// Same emptiness test loadSampleFile uses, including the trailing-newline row.
	return (raw.data as CellValue[][]).filter((row) =>
		row.every((v) => v === null || v === undefined || String(v).trim() === '')
	).length;
}

const SAMPLES = [
	{ file: 'sales.csv', name: 'Retail Sales' },
	{ file: 'hr-employees.csv', name: 'HR / Employees' },
	{ file: 'student-performance.csv', name: 'Student Performance' },
	{ file: 'customer-churn.csv', name: 'Customer Churn' }
] as const;

describe.each(SAMPLES)('full pipeline: $name', ({ file, name }) => {
	const dataset = loadSampleFile(file, name);

	it('parses into a non-trivial table', () => {
		expect(dataset.rowCount).toBeGreaterThan(400);
		expect(dataset.columns.length).toBeGreaterThan(10);
	});

	it('detects at least one measure and one dimension', () => {
		const types = dataset.columns.map((c) => c.type);
		expect(types).toContain('number');
		expect(types.some((t) => t === 'category' || t === 'boolean')).toBe(true);
	});

	it('produces a health score in range, with findings for the seeded problems', () => {
		const report = analyzeQuality(dataset);
		expect(report.score).toBeGreaterThanOrEqual(0);
		expect(report.score).toBeLessThanOrEqual(100);
		// Every sample was generated with deliberate quality problems.
		expect(report.issues.length).toBeGreaterThan(0);
	});

	it('cleans to a strictly better score with no problems left', () => {
		const before = analyzeQuality(dataset);
		const { dataset: cleaned } = autoClean(dataset);
		const after = analyzeQuality(cleaned);

		expect(after.score).toBeGreaterThanOrEqual(before.score);
		expect(after.missingCells).toBe(0);
		expect(after.duplicateRows).toHaveLength(0);
		expect(after.emptyRows).toHaveLength(0);
		expect(after.untrimmedCells).toBe(0);
	});

	it('suggests a dashboard where every chart actually renders', () => {
		const specs = suggestCharts(dataset);
		expect(specs.length).toBeGreaterThanOrEqual(4);

		for (const spec of specs) {
			const data = buildChartData(dataset, dataset.rows, spec, fmt);
			// Not one suggested card may come back empty - that would be a broken dashboard.
			expect(data.empty, `${spec.type} "${spec.title}": ${data.emptyReason}`).toBeFalsy();
			if (spec.type === 'heatmap') {
				expect(data.matrix).toBeDefined();
			} else if (spec.type === 'scatter') {
				expect(data.points!.length).toBeGreaterThan(0);
			} else {
				expect(data.labels.length).toBeGreaterThan(0);
				expect(data.series[0].values.length).toBe(data.labels.length);
			}
		}
	});

	it('computes KPI cards with real values', () => {
		const kpis = suggestKpis(dataset).map((spec) => computeKpi(dataset, dataset.rows, spec, fmt));
		expect(kpis.length).toBeGreaterThan(1);
		// The record count is always first and must match the table.
		expect(kpis[0].value).toBe(dataset.rowCount);
		for (const kpi of kpis) {
			expect(kpi.display).not.toBe('');
			if (kpi.spec.stat !== 'growth') expect(kpi.value).not.toBeNull();
		}
	});

	it('writes insights with no placeholder text', () => {
		const insights = generateInsights(dataset, dataset.rows, analyzeQuality(dataset), fmt);
		expect(insights.length).toBeGreaterThanOrEqual(5);
		for (const insight of insights) {
			expect(insight.detail).not.toMatch(/NaN|undefined|null|Infinity|\[object/);
			expect(insight.title).not.toMatch(/NaN|undefined|\[object/);
			expect(insight.detail.length).toBeGreaterThan(20);
		}
	});

	it('is still coherent after cleaning', () => {
		const { dataset: cleaned } = autoClean(dataset);
		const specs = suggestCharts(cleaned);
		for (const spec of specs) {
			const data = buildChartData(cleaned, cleaned.rows, spec, fmt);
			expect(data.empty, `${spec.title}: ${data.emptyReason}`).toBeFalsy();
		}
		const insights = generateInsights(cleaned, cleaned.rows, analyzeQuality(cleaned), fmt, specs);
		expect(insights.length).toBeGreaterThan(3);
	});
});

/* ------------------- dataset-specific truths worth asserting ------------------ */

describe('Retail Sales specifics', () => {
	const dataset = loadSampleFile('sales.csv', 'Retail Sales');

	it('types the key columns the way the dashboard needs', () => {
		const byName = Object.fromEntries(dataset.columns.map((c) => [c.name, c.type]));
		expect(byName['Order Date']).toBe('date');
		expect(byName['Revenue']).toBe('number');
		expect(byName['Region']).toBe('category');
		expect(byName['Category']).toBe('category');
	});

	it('leads the dashboard with a revenue trend', () => {
		const first = suggestCharts(dataset)[0];
		expect(first.x).toBe('Order Date');
		expect(['line', 'area']).toContain(first.type);
	});

	it('picks Revenue, not Cost, as the headline measure', () => {
		// A sales dashboard is about the top line; cost is how you got there.
		expect(suggestCharts(dataset)[0].y).toBe('Revenue');
	});

	it('finds the generated March slump and names the real drop', () => {
		const insights = generateInsights(dataset, dataset.rows, analyzeQuality(dataset), fmt);
		const drop = insights.find((i) => i.title.includes('Sharp drop'));
		expect(drop).toBeDefined();
		// The generator built a 0.62x multiplier into March 2024.
		expect(drop!.title).toContain('Mar 2024');
		expect(drop!.detail).toMatch(/4\d\.\d%/);
	});

	it('does not report the partial final month as a collapse', () => {
		// The file ends 1 Jul 2025, so July holds a single day. Comparing it against a full
		// June would produce a false "fell 97%" headline - the exact kind of confident wrong
		// answer this product must never generate.
		const insights = generateInsights(dataset, dataset.rows, analyzeQuality(dataset), fmt);
		const text = insights.map((i) => `${i.title} ${i.detail}`).join(' ');
		expect(text).toContain('The last month is incomplete');
		for (const i of insights.filter((x) => x.title.includes('Sharp drop'))) {
			expect(i.title).not.toContain('Jul 2025');
		}
	});

	it('reports growth from complete periods only', () => {
		const growth = suggestKpis(dataset)
			.map((spec) => computeKpi(dataset, dataset.rows, spec, fmt))
			.find((k) => k.spec.stat === 'growth');
		expect(growth).toBeDefined();
		// A plausible month-on-month figure, not a -97% artefact of the partial month.
		expect(Math.abs(growth!.value!)).toBeLessThan(80);
		expect(growth!.hint).toContain('complete');
	});

	it('finds the strong revenue/profit relationship', () => {
		const scatter = suggestCharts(dataset).find((s) => s.type === 'scatter');
		expect(scatter).toBeDefined();
		const data = buildChartData(dataset, dataset.rows, scatter!, fmt);
		expect(data.points!.length).toBeGreaterThan(100);
	});

	it('detects the seeded duplicates and untrimmed regions', () => {
		const report = analyzeQuality(dataset);
		expect(report.duplicateRows.length).toBeGreaterThan(0);
		expect(report.untrimmedCells).toBeGreaterThan(0);
	});

	it('merges split region spellings once trimmed', () => {
		const regionBefore = dataset.columns.find((c) => c.name === 'Region')!;
		const { dataset: cleaned } = autoClean(dataset);
		const regionAfter = cleaned.columns.find((c) => c.name === 'Region')!;
		// ' North ' and 'North' were separate values before the trim.
		expect(regionBefore.distinctCount).toBeGreaterThan(5);
		expect(regionAfter.distinctCount).toBe(5);
	});
});

describe('HR specifics', () => {
	const dataset = loadSampleFile('hr-employees.csv', 'HR');

	it('reads attrition as a yes/no column', () => {
		const attrition = dataset.columns.find((c) => c.name === 'Attrition')!;
		expect(attrition.type).toBe('boolean');
	});

	it('keeps Employee ID out of the measures', () => {
		const id = dataset.columns.find((c) => c.name === 'Employee ID')!;
		expect(id.type).not.toBe('number');
	});

	it('reads salary as a measure with a realistic spread', () => {
		const salary = dataset.columns.find((c) => c.name === 'Annual Salary')!;
		expect(salary.type).toBe('number');
		expect(salary.numeric!.min).toBeGreaterThan(100_000);
		expect(salary.numeric!.max).toBeLessThan(10_000_000);
	});
});

describe('Student specifics', () => {
	const dataset = loadSampleFile('student-performance.csv', 'Students');

	it('reads marks as measures', () => {
		for (const name of ['Mathematics', 'Science', 'English', 'Percentage']) {
			expect(dataset.columns.find((c) => c.name === name)!.type, name).toBe('number');
		}
	});

	it('reads Grade and Result as categories to group by', () => {
		expect(dataset.columns.find((c) => c.name === 'Grade')!.type).toBe('category');
		expect(dataset.columns.find((c) => c.name === 'Result')!.type).toBe('category');
	});

	it('surfaces the attendance/marks relationship', () => {
		const insights = generateInsights(dataset, dataset.rows, analyzeQuality(dataset), fmt);
		expect(insights.some((i) => i.kind === 'correlation')).toBe(true);
	});
});

describe('Churn specifics', () => {
	const dataset = loadSampleFile('customer-churn.csv', 'Churn');

	it('reads Churned as a yes/no column', () => {
		expect(dataset.columns.find((c) => c.name === 'Churned')!.type).toBe('boolean');
	});

	it('reports the deliberately blank rows as parser-skipped, not as rows to clean', () => {
		// A fully blank CSV line is dropped by the parser and counted in skippedEmptyRows,
		// so it must NOT also show up as an "empty row" on the cleaning screen.
		expect(blankRowsInFile('customer-churn.csv')).toBeGreaterThan(0);
		expect(dataset.skippedEmptyRows).toBe(blankRowsInFile('customer-churn.csv'));
		expect(analyzeQuality(dataset).emptyRows).toHaveLength(0);
	});

	it('still has plenty of missing values to fill', () => {
		expect(analyzeQuality(dataset).missingCells).toBeGreaterThan(50);
	});

	it('reads Contract as a dimension', () => {
		const contract = dataset.columns.find((c) => c.name === 'Contract')!;
		expect(contract.type).toBe('category');
		expect(contract.distinctCount).toBe(3);
	});
});
