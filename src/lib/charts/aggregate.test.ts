import { describe, expect, it } from 'vitest';
import {
	aggregateValues,
	applyFilters,
	bucketStart,
	buildChartData,
	correlationMatrix,
	describeFilters,
	histogramBins
} from './aggregate';
import { buildDataset } from '../analysis/stats';
import { DEFAULT_SETTINGS, formatOptionsFrom } from '../format';
import type { CellValue, ChartSpec, Dataset, FilterState } from '../types';

const fmt = formatOptionsFrom({ ...DEFAULT_SETTINGS, numberFormat: 'international' });

function make(headers: string[], rows: CellValue[][]): Dataset {
	return buildDataset({ headers, rows, skippedEmptyRows: 0 }, { name: 'T', source: 'upload' });
}

/** Sales-shaped fixture used by most of these tests. */
function sales(): Dataset {
	return make(
		['Order Date', 'Region', 'Channel', 'Revenue', 'Cost'],
		[
			['2024-01-10', 'North', 'Online', '1000', '600'],
			['2024-01-20', 'South', 'Retail', '2000', '1100'],
			['2024-02-05', 'North', 'Online', '1500', '900'],
			['2024-02-18', 'East', 'Retail', '800', '500'],
			['2024-03-02', 'South', 'Online', '2500', '1400'],
			['2024-03-22', 'West', 'Retail', '3000', '1700'],
			['2024-04-11', 'North', 'Online', '1200', '700'],
			['2024-04-28', 'South', 'Retail', '2200', '1250']
		]
	);
}

const NO_FILTERS: FilterState = { filters: [], crossFilter: null };

describe('bucketStart', () => {
	const ts = Date.UTC(2024, 2, 14, 15, 30); // Thu 14 Mar 2024

	it('snaps to the start of each bucket in UTC', () => {
		expect(bucketStart(ts, 'day')).toBe(Date.UTC(2024, 2, 14));
		expect(bucketStart(ts, 'month')).toBe(Date.UTC(2024, 2, 1));
		expect(bucketStart(ts, 'quarter')).toBe(Date.UTC(2024, 0, 1));
		expect(bucketStart(ts, 'year')).toBe(Date.UTC(2024, 0, 1));
	});

	it('snaps weeks back to Monday', () => {
		// 14 Mar 2024 is a Thursday; its ISO week starts Mon 11 Mar.
		expect(bucketStart(ts, 'week')).toBe(Date.UTC(2024, 2, 11));
	});
});

describe('aggregateValues', () => {
	const values = [10, 20, 30, 40];
	it('folds with each aggregation', () => {
		expect(aggregateValues(values, 'sum', 4)).toBe(100);
		expect(aggregateValues(values, 'avg', 4)).toBe(25);
		expect(aggregateValues(values, 'min', 4)).toBe(10);
		expect(aggregateValues(values, 'max', 4)).toBe(40);
		expect(aggregateValues([10, 10, 20], 'distinct', 3)).toBe(2);
	});

	it('counts rows, not values, so missing cells still count as rows', () => {
		expect(aggregateValues([10, 20], 'count', 5)).toBe(5);
	});

	it('returns null rather than 0 when there is nothing to total', () => {
		// A null leaves a gap in a line chart; a 0 would draw a false dip to the axis.
		expect(aggregateValues([], 'sum', 0)).toBeNull();
		expect(aggregateValues([], 'avg', 0)).toBeNull();
	});
});

describe('applyFilters', () => {
	it('returns the original array when nothing is filtered', () => {
		const ds = sales();
		expect(applyFilters(ds, NO_FILTERS)).toBe(ds.rows);
	});

	it('filters by category', () => {
		const ds = sales();
		const rows = applyFilters(ds, {
			filters: [{ kind: 'category', column: 'Region', values: ['North'] }],
			crossFilter: null
		});
		expect(rows).toHaveLength(3);
	});

	it('treats an empty category selection as "all", not "none"', () => {
		const ds = sales();
		const rows = applyFilters(ds, {
			filters: [{ kind: 'category', column: 'Region', values: [] }],
			crossFilter: null
		});
		expect(rows).toHaveLength(ds.rowCount);
	});

	it('filters by inclusive date range', () => {
		const ds = sales();
		const rows = applyFilters(ds, {
			filters: [
				{
					kind: 'date',
					column: 'Order Date',
					from: Date.UTC(2024, 1, 1),
					to: Date.UTC(2024, 2, 31, 23, 59, 59)
				}
			],
			crossFilter: null
		});
		expect(rows).toHaveLength(4);
	});

	it('filters by numeric range', () => {
		const ds = sales();
		const rows = applyFilters(ds, {
			filters: [{ kind: 'number', column: 'Revenue', min: 1500, max: 2500 }],
			crossFilter: null
		});
		expect(rows).toHaveLength(4);
	});

	it('combines several filters with AND', () => {
		const ds = sales();
		const rows = applyFilters(ds, {
			filters: [
				{ kind: 'category', column: 'Region', values: ['North', 'South'] },
				{ kind: 'number', column: 'Revenue', min: 1500, max: 5000 }
			],
			crossFilter: null
		});
		// North 1500, South 2000, South 2500, South 2200
		expect(rows).toHaveLength(4);
	});

	it('applies a cross-filter from a clicked category', () => {
		const ds = sales();
		const rows = applyFilters(ds, {
			filters: [],
			crossFilter: { column: 'Channel', value: 'Online', label: 'Online', fromChart: 'c1' }
		});
		expect(rows).toHaveLength(4);
	});

	it('expands a clicked trend point to its whole bucket', () => {
		const ds = sales();
		const rows = applyFilters(ds, {
			filters: [],
			crossFilter: {
				column: 'Order Date',
				value: Date.UTC(2024, 0, 1),
				label: 'Jan 2024',
				fromChart: 'c1',
				bucket: 'month'
			}
		});
		// Both January orders, not just the exact timestamp clicked.
		expect(rows).toHaveLength(2);
	});

	it('uses the clicking chart\'s bucket, not the column default', () => {
		const ds = sales();
		// The same column viewed by quarter: clicking Q1 must select Jan-Mar (6 rows),
		// not just January.
		const rows = applyFilters(ds, {
			filters: [],
			crossFilter: {
				column: 'Order Date',
				value: Date.UTC(2024, 0, 1),
				label: 'Q1 2024',
				fromChart: 'c1',
				bucket: 'quarter'
			}
		});
		expect(rows).toHaveLength(6);
	});

	it('ignores a filter on a column that no longer exists', () => {
		const ds = sales();
		const rows = applyFilters(ds, {
			filters: [{ kind: 'category', column: 'Deleted Column', values: ['x'] }],
			crossFilter: null
		});
		expect(rows).toHaveLength(ds.rowCount);
	});
});

describe('buildChartData', () => {
	it('builds a monthly trend in chronological order', () => {
		const ds = sales();
		const spec: ChartSpec = {
			id: 'c',
			title: 't',
			type: 'line',
			x: 'Order Date',
			y: 'Revenue',
			agg: 'sum',
			bucket: 'month'
		};
		const data = buildChartData(ds, ds.rows, spec, fmt);
		expect(data.labels).toEqual(['Jan 2024', 'Feb 2024', 'Mar 2024', 'Apr 2024']);
		expect(data.series[0].values).toEqual([3000, 2300, 5500, 3400]);
	});

	it('ranks a category bar chart descending', () => {
		const ds = sales();
		const spec: ChartSpec = {
			id: 'c',
			title: 't',
			type: 'bar',
			x: 'Region',
			y: 'Revenue',
			agg: 'sum'
		};
		const data = buildChartData(ds, ds.rows, spec, fmt);
		expect(data.labels[0]).toBe('South'); // 2000 + 2500 + 2200 = 6700
		expect(data.series[0].values[0]).toBe(6700);
		// Descending.
		const values = data.series[0].values as number[];
		expect([...values].sort((a, b) => b - a)).toEqual(values);
	});

	it('averages instead of totalling when asked', () => {
		const ds = sales();
		const data = buildChartData(
			ds,
			ds.rows,
			{ id: 'c', title: 't', type: 'bar', x: 'Region', y: 'Revenue', agg: 'avg' },
			fmt
		);
		const north = data.labels.indexOf('North');
		// (1000 + 1500 + 1200) / 3
		expect(data.series[0].values[north]).toBeCloseTo(1233.333, 2);
	});

	it('counts rows when there is no measure', () => {
		const ds = sales();
		const data = buildChartData(
			ds,
			ds.rows,
			{ id: 'c', title: 't', type: 'bar', x: 'Region', y: null, agg: 'count' },
			fmt
		);
		expect(data.series[0].values.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(8);
	});

	it('rolls a pie chart tail into "Other" so shares still sum to 100%', () => {
		const rows: CellValue[][] = Array.from({ length: 12 }, (_, i) => [`Cat ${i}`, String(100 - i)]);
		const ds = make(['Category', 'Value'], rows);
		const data = buildChartData(
			ds,
			ds.rows,
			{ id: 'c', title: 't', type: 'donut', x: 'Category', y: 'Value', agg: 'sum', limit: 5 },
			fmt
		);
		expect(data.labels).toHaveLength(6);
		expect(data.labels[5]).toContain('Other');
		const total = (data.series[0].values as number[]).reduce((a, b) => a + b, 0);
		expect(total).toBe(rows.reduce((sum, r) => sum + Number(r[1]), 0));
	});

	it('splits into one series per group-by value', () => {
		const ds = sales();
		const data = buildChartData(
			ds,
			ds.rows,
			{
				id: 'c',
				title: 't',
				type: 'line',
				x: 'Order Date',
				y: 'Revenue',
				agg: 'sum',
				groupBy: 'Channel',
				bucket: 'month'
			},
			fmt
		);
		expect(data.series.map((s) => s.name).sort()).toEqual(['Online', 'Retail']);
		// Every series shares the same axis length.
		for (const s of data.series) expect(s.values).toHaveLength(data.labels.length);
	});

	it('bins a histogram and counts every value exactly once', () => {
		const ds = make(
			['Score'],
			Array.from({ length: 50 }, (_, i) => [String(i * 2)])
		);
		const data = buildChartData(
			ds,
			ds.rows,
			{ id: 'c', title: 't', type: 'histogram', x: 'Score', y: null, agg: 'count', bins: 10 },
			fmt
		);
		expect(data.labels).toHaveLength(10);
		expect((data.series[0].values as number[]).reduce((a, b) => a + b, 0)).toBe(50);
	});

	it('pairs scatter points and skips rows missing either value', () => {
		const ds = make(
			['A', 'B'],
			[
				['1', '2'],
				['2', '4'],
				['3', ''],
				['4', '8'],
				['5', '10']
			]
		);
		const data = buildChartData(
			ds,
			ds.rows,
			{ id: 'c', title: 't', type: 'scatter', x: 'A', y: 'B', agg: 'avg' },
			fmt
		);
		expect(data.points).toHaveLength(4);
	});

	it('explains itself instead of throwing when the data cannot make the chart', () => {
		const ds = sales();
		const empty = buildChartData(ds, [], { id: 'c', title: 't', type: 'bar', x: 'Region', y: 'Revenue', agg: 'sum' }, fmt);
		expect(empty.empty).toBe(true);
		expect(empty.emptyReason).toContain('filters');

		const badScatter = buildChartData(
			ds,
			ds.rows,
			{ id: 'c', title: 't', type: 'scatter', x: 'Region', y: 'Revenue', agg: 'avg' },
			fmt
		);
		expect(badScatter.empty).toBe(true);
		expect(badScatter.emptyReason).toContain('two number columns');
	});
});

describe('correlationMatrix', () => {
	it('builds a square matrix with 1.0 down the diagonal', () => {
		const ds = sales();
		const data = correlationMatrix(ds, ds.rows);
		expect(data.matrix).toBeDefined();
		const n = data.matrix!.xLabels.length;
		expect(data.matrix!.cells).toHaveLength(n * n);
		for (const [x, yy, v] of data.matrix!.cells) {
			if (x === yy) expect(v).toBe(1);
			expect(v).toBeGreaterThanOrEqual(-1);
			expect(v).toBeLessThanOrEqual(1);
		}
	});

	it('refuses with a reason when there are not two numeric columns', () => {
		const ds = make(['Region'], [['North'], ['South'], ['East']]);
		expect(correlationMatrix(ds, ds.rows).empty).toBe(true);
	});
});

describe('histogramBins', () => {
	it('honours an explicit bin count within sane limits', () => {
		expect(histogramBins([1, 2, 3], 12)).toBe(12);
		expect(histogramBins([1, 2, 3], 500)).toBe(60);
		expect(histogramBins([1, 2, 3], 1)).toBe(3);
	});

	it('derives a readable bin count from the data', () => {
		const values = Array.from({ length: 200 }, (_, i) => i);
		const bins = histogramBins(values);
		expect(bins).toBeGreaterThanOrEqual(5);
		expect(bins).toBeLessThanOrEqual(40);
	});

	it('falls back sensibly on zero-variance data', () => {
		expect(histogramBins(Array(50).fill(7))).toBe(10);
	});
});

describe('describeFilters', () => {
	it('describes active filters in words', () => {
		const ds = sales();
		const summary = describeFilters(
			ds,
			{
				filters: [{ kind: 'category', column: 'Region', values: ['North', 'South'] }],
				crossFilter: { column: 'Channel', value: 'Online', label: 'Online', fromChart: 'c' }
			},
			fmt
		);
		expect(summary).toContain('Region: North, South');
		expect(summary).toContain('Channel: Online');
	});

	it('says nothing when no filter is actually narrowing the data', () => {
		const ds = sales();
		expect(
			describeFilters(ds, { filters: [{ kind: 'category', column: 'Region', values: [] }], crossFilter: null }, fmt)
		).toEqual([]);
	});
});
