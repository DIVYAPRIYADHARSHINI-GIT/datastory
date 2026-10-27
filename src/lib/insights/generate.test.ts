import { describe, expect, it } from 'vitest';
import { describeStrength, generateInsights, insightsToText } from './generate';
import { analyzeQuality } from '../analysis/quality';
import { buildDataset } from '../analysis/stats';
import { DEFAULT_SETTINGS, formatOptionsFrom } from '../format';
import type { CellValue, Dataset, Insight } from '../types';

const fmt = formatOptionsFrom(DEFAULT_SETTINGS);

function make(headers: string[], rows: CellValue[][]): Dataset {
	return buildDataset({ headers, rows, skippedEmptyRows: 0 }, { name: 'Test data', source: 'upload' });
}

function run(ds: Dataset): Insight[] {
	return generateInsights(ds, ds.rows, analyzeQuality(ds), fmt);
}

/** 12 months with a deliberate collapse in March and a dominant region. */
function seasonal(): Dataset {
	const rows: CellValue[][] = [];
	const monthly = [1000, 1000, 300, 700, 1100, 1200, 1150, 1100, 1180, 1900, 2000, 1300];
	monthly.forEach((total, i) => {
		// West takes 60% of every month, so it dominates composition.
		rows.push([`2024-${String(i + 1).padStart(2, '0')}-10`, 'West', String(Math.round(total * 0.6))]);
		rows.push([`2024-${String(i + 1).padStart(2, '0')}-15`, 'North', String(Math.round(total * 0.25))]);
		rows.push([`2024-${String(i + 1).padStart(2, '0')}-20`, 'South', String(Math.round(total * 0.15))]);
	});
	return make(['Order Date', 'Region', 'Revenue'], rows);
}

describe('describeStrength', () => {
	it('describes correlation strength the way an analyst would', () => {
		expect(describeStrength(0.95)).toBe('almost perfect');
		expect(describeStrength(-0.8)).toBe('strong');
		expect(describeStrength(0.6)).toBe('moderate');
		expect(describeStrength(0.35)).toBe('weak but visible');
		expect(describeStrength(0.1)).toBe('very weak');
	});
});

describe('generateInsights', () => {
	it('always opens with a dataset overview', () => {
		const insights = run(seasonal());
		expect(insights[0].kind).toBe('summary');
		expect(insights[0].detail).toContain('36 rows');
		expect(insights[0].detail).toContain('3 columns');
	});

	it('finds the sharp drop in March and names the month', () => {
		const insights = run(seasonal());
		const drop = insights.find((i) => i.title.toLowerCase().includes('sharp drop'));
		expect(drop).toBeDefined();
		expect(drop!.title).toContain('Mar 2024');
		expect(drop!.severity).toBe('warning');
		// The number in the sentence must be the real one: 1000 -> 300 is -70%.
		expect(drop!.detail).toContain('70.0%');
	});

	it('finds the dominant category and states its real share', () => {
		const insights = run(seasonal());
		const lead = insights.find((i) => i.kind === 'composition' && i.title.includes('West'));
		expect(lead).toBeDefined();
		// West was generated at 60% of every month.
		expect(lead!.detail).toMatch(/59\.\d%|60\.\d%/);
	});

	it('finds a strong correlation and adds the causation caveat', () => {
		const rows: CellValue[][] = Array.from({ length: 60 }, (_, i) => [
			String(100 + i * 10),
			String(60 + i * 6),
			['N', 'S'][i % 2]
		]);
		const insights = run(make(['Revenue', 'Cost', 'Region'], rows));
		const corr = insights.find((i) => i.kind === 'correlation');
		expect(corr).toBeDefined();
		expect(corr!.detail).toContain('Correlation is not causation');
	});

	it('flags two columns that duplicate each other', () => {
		const rows: CellValue[][] = Array.from({ length: 40 }, (_, i) => [
			String(100 + i),
			String((100 + i) * 2) // exactly derived
		]);
		const insights = run(make(['Price', 'Double Price', ], rows));
		expect(insights.some((i) => i.title.includes('say the same thing'))).toBe(true);
	});

	it('flags outliers with a count and a comparison to the median', () => {
		const rows: CellValue[][] = [
			...Array.from({ length: 40 }, (_, i) => [String(100 + i)]),
			['99999']
		];
		const insights = run(make(['Amount'], rows));
		const outlier = insights.find((i) => i.kind === 'outlier');
		expect(outlier).toBeDefined();
		expect(outlier!.detail).toContain('median');
	});

	it('warns when the mean is dragged away from the median', () => {
		// Values must be continuous: a column of only two distinct integers is detected as a
		// code set (category), not a measure, so there would be no mean to compare.
		const rows: CellValue[][] = [
			...Array.from({ length: 50 }, (_, i) => [String(100 + i)]),
			...Array.from({ length: 5 }, (_, i) => [String(100000 + i)])
		];
		const insights = run(make(['Amount'], rows));
		expect(insights.some((i) => i.title.includes('misleading'))).toBe(true);
	});

	it('reports missing data as a quality insight with the real count', () => {
		const rows: CellValue[][] = Array.from({ length: 40 }, (_, i) => [
			i < 10 ? '' : String(i),
			['N', 'S'][i % 2]
		]);
		const insights = run(make(['Score', 'Region'], rows));
		const quality = insights.find((i) => i.kind === 'quality' && i.title.includes('Score'));
		expect(quality).toBeDefined();
		expect(quality!.detail).toContain('10 of 40');
	});

	it('reports duplicates as a quality insight', () => {
		const base: CellValue[][] = Array.from({ length: 20 }, (_, i) => [String(i), 'X']);
		const rows = [...base, ...base.slice(0, 5)];
		const insights = run(make(['Id', 'Tag'], rows));
		expect(insights.some((i) => i.title.includes('duplicate rows'))).toBe(true);
	});

	it('flags a zero-heavy column that quietly lowers every average', () => {
		const rows: CellValue[][] = [
			...Array.from({ length: 30 }, () => ['0']),
			...Array.from({ length: 30 }, (_, i) => [String(100 + i)])
		];
		const insights = run(make(['Amount'], rows));
		expect(insights.some((i) => i.title.includes('is zero'))).toBe(true);
	});

	it('says so clearly when filters leave no rows', () => {
		const ds = seasonal();
		const insights = generateInsights(ds, [], analyzeQuality(ds), fmt);
		expect(insights).toHaveLength(1);
		expect(insights[0].title).toContain('No rows match');
	});

	it('never repeats the same headline twice', () => {
		const titles = run(seasonal()).map((i) => i.title.toLowerCase());
		expect(new Set(titles).size).toBe(titles.length);
	});

	it('returns insights in descending importance', () => {
		const weights = run(seasonal()).map((i) => i.weight);
		expect([...weights].sort((a, b) => b - a)).toEqual(weights);
	});

	it('gives every insight a title, a detail and a severity', () => {
		for (const insight of run(seasonal())) {
			expect(insight.title.length).toBeGreaterThan(3);
			expect(insight.detail.length).toBeGreaterThan(15);
			expect(['info', 'warning', 'highlight']).toContain(insight.severity);
		}
	});

	it('links an insight to a chart that already exists on the dashboard', () => {
		const ds = seasonal();
		const charts = [
			{
				id: 'existing-trend',
				title: 'Revenue over time',
				type: 'line' as const,
				x: 'Order Date',
				y: 'Revenue',
				agg: 'sum' as const
			}
		];
		const insights = generateInsights(ds, ds.rows, analyzeQuality(ds), fmt, charts);
		expect(insights.some((i) => i.chartId === 'existing-trend')).toBe(true);
	});

	it('handles a one-row dataset without throwing', () => {
		const ds = make(['A', 'B'], [['1', 'x']]);
		expect(() => run(ds)).not.toThrow();
		expect(run(ds).length).toBeGreaterThan(0);
	});

	it('handles an all-text dataset without throwing', () => {
		const rows: CellValue[][] = Array.from({ length: 30 }, (_, i) => [
			`Note ${i}`,
			['Alpha', 'Beta', 'Gamma'][i % 3]
		]);
		expect(() => run(make(['Note', 'Tag'], rows))).not.toThrow();
	});
});

describe('insightsToText', () => {
	it('produces pasteable text with severity tags and the filter context', () => {
		const ds = seasonal();
		const text = insightsToText(ds, run(ds), ['Region: West']);
		expect(text).toContain('DataStory insights - Test data');
		expect(text).toContain('36 rows');
		expect(text).toContain('Filters: Region: West');
		expect(text).toMatch(/\[(INFO|WARNING|HIGHLIGHT)\]/);
		expect(text).toContain('all analysis ran in the browser');
	});
});
