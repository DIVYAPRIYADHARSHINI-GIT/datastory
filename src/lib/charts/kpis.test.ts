import { describe, expect, it } from 'vitest';
import { computeKpi, growthOf, kpiChart, suggestKpis } from './kpis';
import { buildDataset } from '../analysis/stats';
import { DEFAULT_SETTINGS, formatOptionsFrom } from '../format';
import type { CellValue, Dataset, KpiSpec } from '../types';

const fmt = formatOptionsFrom({ ...DEFAULT_SETTINGS, currency: '₹' });

function make(headers: string[], rows: CellValue[][]): Dataset {
	return buildDataset({ headers, rows, skippedEmptyRows: 0 }, { name: 'T', source: 'upload' });
}

/** Six months, revenue rising then one down month. */
function monthly(): Dataset {
	return make(
		['Order Date', 'Region', 'Revenue'],
		[
			['2024-01-15', 'North', '1000'],
			['2024-02-15', 'South', '1200'],
			['2024-03-15', 'North', '1400'],
			['2024-04-15', 'East', '1600'],
			['2024-05-15', 'South', '2000'],
			['2024-06-15', 'West', '1800']
		]
	);
}

describe('growthOf', () => {
	it('compares the last two periods', () => {
		expect(growthOf([100, 150])).toBe(50);
		expect(growthOf([200, 150])).toBe(-25);
	});

	it('returns null when there is not enough history', () => {
		expect(growthOf([])).toBeNull();
		expect(growthOf([100])).toBeNull();
	});

	it('handles a zero previous period without dividing by zero', () => {
		expect(growthOf([0, 0])).toBe(0);
		expect(growthOf([0, 100])).toBeNull();
	});

	it('uses the absolute previous value so a recovery from negative reads up', () => {
		expect(growthOf([-100, -50])).toBe(50);
	});
});

describe('suggestKpis', () => {
	it('always starts with the record count', () => {
		const kpis = suggestKpis(monthly());
		expect(kpis[0].stat).toBe('count');
		expect(kpis[0].label).toBe('Records');
	});

	it('adds total, average, growth and max for the primary measure', () => {
		const stats = suggestKpis(monthly()).map((k) => k.stat);
		expect(stats).toContain('sum');
		expect(stats).toContain('avg');
		expect(stats).toContain('growth');
		expect(stats).toContain('max');
	});

	it('omits growth when there is no date column', () => {
		const ds = make(
			['Region', 'Revenue'],
			[['North', '100'], ['South', '200'], ['East', '300'], ['West', '400']]
		);
		expect(suggestKpis(ds).some((k) => k.stat === 'growth')).toBe(false);
	});

	it('picks a currency format from a monetary column name', () => {
		const revenue = suggestKpis(monthly()).find((k) => k.column === 'Revenue' && k.stat === 'sum');
		expect(revenue?.format).toBe('currency');
	});

	it('never suggests more than six cards', () => {
		const ds = make(
			['Revenue', 'Cost', 'Profit', 'Tax', 'Discount', 'Margin', 'Spend'],
			Array.from({ length: 20 }, (_, i) => Array(7).fill(String(i * 10 + 5)))
		);
		expect(suggestKpis(ds).length).toBeLessThanOrEqual(6);
	});

	it('still produces something useful with no measures at all', () => {
		const ds = make(
			['Region', 'Channel'],
			Array.from({ length: 20 }, (_, i) => [['N', 'S', 'E'][i % 3], ['A', 'B'][i % 2]])
		);
		expect(suggestKpis(ds).length).toBeGreaterThan(0);
	});
});

describe('computeKpi', () => {
	const ds = monthly();

	function spec(partial: Partial<KpiSpec>): KpiSpec {
		return {
			id: 'k',
			label: 'Test',
			column: 'Revenue',
			stat: 'sum',
			trendColumn: 'Order Date',
			format: 'number',
			...partial
		};
	}

	it('totals a measure', () => {
		const kpi = computeKpi(ds, ds.rows, spec({ stat: 'sum' }), fmt);
		expect(kpi.value).toBe(9000);
	});

	it('averages a measure', () => {
		expect(computeKpi(ds, ds.rows, spec({ stat: 'avg' }), fmt).value).toBe(1500);
	});

	it('finds the largest and smallest single value', () => {
		expect(computeKpi(ds, ds.rows, spec({ stat: 'max' }), fmt).value).toBe(2000);
		expect(computeKpi(ds, ds.rows, spec({ stat: 'min' }), fmt).value).toBe(1000);
	});

	it('counts rows, not values', () => {
		const kpi = computeKpi(ds, ds.rows, spec({ stat: 'count', column: null, format: 'integer' }), fmt);
		expect(kpi.value).toBe(6);
	});

	it('computes period-over-period growth from the bucketed trend', () => {
		const kpi = computeKpi(ds, ds.rows, spec({ stat: 'growth', format: 'percent' }), fmt);
		// May 2000 -> June 1800 is -10%.
		expect(kpi.value).toBeCloseTo(-10, 5);
		expect(kpi.display).toBe('-10.0%');
	});

	it('builds a sparkline with one point per period', () => {
		const kpi = computeKpi(ds, ds.rows, spec({ stat: 'sum' }), fmt);
		expect(kpi.sparkline).toEqual([1000, 1200, 1400, 1600, 2000, 1800]);
	});

	it('formats currency with the configured symbol', () => {
		const kpi = computeKpi(ds, ds.rows, spec({ stat: 'sum', format: 'currency' }), fmt);
		expect(kpi.display).toContain('₹');
	});

	it('reports an em dash rather than zero when filters leave nothing', () => {
		const kpi = computeKpi(ds, [], spec({ stat: 'sum' }), fmt);
		expect(kpi.value).toBeNull();
		expect(kpi.display).toBe('—');
	});

	it('says why growth is unavailable with a single period', () => {
		const single = make(['Order Date', 'Revenue'], [['2024-01-15', '1000']]);
		const kpi = computeKpi(
			single,
			single.rows,
			spec({ stat: 'growth', format: 'percent' }),
			fmt
		);
		expect(kpi.display).toBe('—');
		expect(kpi.hint).toContain('two periods');
	});

	it('counts distinct values for a non-numeric column', () => {
		const kpi = computeKpi(
			ds,
			ds.rows,
			spec({ stat: 'count', column: 'Region', format: 'integer' }),
			fmt
		);
		expect(kpi.value).toBe(4);
		expect(kpi.hint).toContain('distinct');
	});

	it('respects filtered rows', () => {
		const northOnly = ds.rows.filter((r) => r[1] === 'North');
		expect(computeKpi(ds, northOnly, spec({ stat: 'sum' }), fmt).value).toBe(2400);
	});
});

describe('kpiChart', () => {
	it('returns a trend spec for a KPI with a date', () => {
		const ds = monthly();
		const chart = kpiChart(ds, {
			id: 'k',
			label: 'Total Revenue',
			column: 'Revenue',
			stat: 'sum',
			trendColumn: 'Order Date'
		});
		expect(chart?.type).toBe('line');
		expect(chart?.x).toBe('Order Date');
		expect(chart?.y).toBe('Revenue');
	});

	it('returns null with no date to trend against', () => {
		const ds = make(['Revenue'], [['1'], ['2'], ['3']]);
		expect(
			kpiChart(ds, { id: 'k', label: 'x', column: 'Revenue', stat: 'sum', trendColumn: null })
		).toBeNull();
	});
});
