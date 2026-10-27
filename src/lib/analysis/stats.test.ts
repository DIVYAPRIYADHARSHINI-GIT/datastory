import { describe, expect, it } from 'vitest';
import {
	buildDataset,
	correlation,
	linearSlope,
	mean,
	median,
	mode,
	pickGranularity,
	quantileSorted,
	retypeColumn,
	stdDev,
	summarizeNumeric
} from './stats';
import type { RawTable } from '../types';

function table(headers: string[], rows: (string | number | boolean | null)[][]): RawTable {
	return { headers, rows, skippedEmptyRows: 0 };
}

describe('descriptive statistics', () => {
	it('computes mean, median and sample standard deviation', () => {
		const values = [2, 4, 4, 4, 5, 5, 7, 9];
		expect(mean(values)).toBe(5);
		expect(median(values)).toBe(4.5);
		// Sample SD (n-1), not population SD.
		expect(stdDev(values)).toBeCloseTo(2.138, 3);
	});

	it('interpolates quantiles', () => {
		const sorted = [1, 2, 3, 4];
		expect(quantileSorted(sorted, 0)).toBe(1);
		expect(quantileSorted(sorted, 0.5)).toBe(2.5);
		expect(quantileSorted(sorted, 1)).toBe(4);
	});

	it('returns the first-seen value on a mode tie, so fills are deterministic', () => {
		expect(mode(['b', 'a', 'a', 'b'])).toBe('b');
		expect(mode([1, 1, 2, 2, 2])).toBe(2);
		expect(mode([null, null])).toBeNull();
	});

	it('computes Pearson correlation', () => {
		expect(correlation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 6);
		expect(correlation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBeCloseTo(-1, 6);
		// Zero variance has no defined correlation.
		expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
		// Fewer than 3 pairs is not a relationship.
		expect(correlation([1, 2], [2, 4])).toBeNull();
	});

	it('computes a least-squares slope for trend direction', () => {
		expect(linearSlope([1, 2, 3, 4, 5])).toBeCloseTo(1, 6);
		expect(linearSlope([5, 4, 3, 2, 1])).toBeCloseTo(-1, 6);
		expect(linearSlope([3, 3, 3])).toBe(0);
	});
});

describe('summarizeNumeric', () => {
	it('finds Tukey-fence outliers and reports their row indices', () => {
		const values = [10, 11, 12, 13, 14, 15, 16, 17, 18, 500];
		const rowIndices = values.map((_, i) => i);
		const summary = summarizeNumeric(values, rowIndices);
		expect(summary.outlierCount).toBe(1);
		expect(summary.outlierRows).toEqual([9]);
		expect(summary.min).toBe(10);
		expect(summary.max).toBe(500);
	});

	it('reports no outliers when the IQR is zero', () => {
		const values = [5, 5, 5, 5, 5];
		const summary = summarizeNumeric(values, [0, 1, 2, 3, 4]);
		expect(summary.outlierCount).toBe(0);
		expect(summary.stdDev).toBe(0);
	});
});

describe('pickGranularity', () => {
	const day = 86400000;
	it('picks a bucket that keeps the axis readable', () => {
		expect(pickGranularity(0, 30 * day)).toBe('day');
		expect(pickGranularity(0, 150 * day)).toBe('week');
		expect(pickGranularity(0, 500 * day)).toBe('month');
		expect(pickGranularity(0, 2000 * day)).toBe('quarter');
		expect(pickGranularity(0, 6000 * day)).toBe('year');
	});
});

describe('buildDataset', () => {
	const raw = table(
		['Order Date', 'Region', 'Revenue', 'Shipped'],
		[
			['2024-01-15', 'North', '1200', 'Yes'],
			['2024-02-20', 'South', '2400', 'No'],
			['2024-03-25', 'North', '', 'Yes'],
			['2024-04-30', 'East', '3600', 'Yes'],
			['2024-05-05', 'South', '1800', 'No']
		]
	);

	it('types every column and coerces the values', () => {
		const ds = buildDataset(raw, { name: 'Test', source: 'upload' });
		expect(ds.columns.map((c) => c.type)).toEqual(['date', 'category', 'number', 'boolean']);
		expect(ds.rowCount).toBe(5);
		// Dates become epoch ms, numbers become numbers, booleans become booleans.
		expect(ds.rows[0][0]).toBe(Date.UTC(2024, 0, 15));
		expect(ds.rows[0][2]).toBe(1200);
		expect(ds.rows[0][3]).toBe(true);
	});

	it('counts the blank revenue cell as missing', () => {
		const ds = buildDataset(raw, { name: 'Test', source: 'upload' });
		const revenue = ds.columns.find((c) => c.name === 'Revenue')!;
		expect(revenue.missing).toBe(1);
		expect(revenue.numeric?.count).toBe(4);
		expect(revenue.numeric?.sum).toBe(1200 + 2400 + 3600 + 1800);
	});

	it('summarises categories by frequency', () => {
		const ds = buildDataset(raw, { name: 'Test', source: 'upload' });
		const region = ds.columns.find((c) => c.name === 'Region')!;
		expect(region.distinctCount).toBe(3);
		expect(region.category?.top[0]).toEqual({ value: 'North', count: 2 });
	});

	it('honours a type override from the preview screen', () => {
		const ds = buildDataset(raw, {
			name: 'Test',
			source: 'upload',
			overrides: { Revenue: 'text' }
		});
		const revenue = ds.columns.find((c) => c.name === 'Revenue')!;
		expect(revenue.type).toBe('text');
		expect(revenue.detectedType).toBe('number');
		expect(revenue.overridden).toBe(true);
	});
});

describe('retypeColumn', () => {
	it('re-reads a date column as text without losing the value', () => {
		const ds = buildDataset(
			table(
				['When', 'Value'],
				[
					['2024-01-15', '1'],
					['2024-02-20', '2'],
					['2024-03-25', '3'],
					['2024-04-30', '4'],
					['2024-05-05', '5']
				]
			),
			{ name: 'T', source: 'upload' }
		);
		expect(ds.columns[0].type).toBe('date');

		const retyped = retypeColumn(ds, 'When', 'text');
		expect(retyped.columns[0].type).toBe('text');
		// Stored as epoch ms, so re-typing has to render back to an ISO string first.
		expect(retyped.rows[0][0]).toBe('2024-01-15');
		expect(retyped.columns[0].missing).toBe(0);
	});

	it('marks a hand-changed column as overridden', () => {
		const ds = buildDataset(
			table(['Score'], [['10'], ['20'], ['30'], ['40'], ['50']]),
			{ name: 'T', source: 'upload' }
		);
		const retyped = retypeColumn(ds, 'Score', 'category');
		expect(retyped.columns[0].overridden).toBe(true);
		expect(retyped.columns[0].detectedType).toBe('number');
	});

	it('is a no-op when the type is unchanged', () => {
		const ds = buildDataset(table(['A'], [['1'], ['2'], ['3']]), { name: 'T', source: 'upload' });
		expect(retypeColumn(ds, 'A', ds.columns[0].type)).toBe(ds);
	});
});
