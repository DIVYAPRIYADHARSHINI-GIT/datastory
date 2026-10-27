import { describe, expect, it } from 'vitest';
import { assignRoles, compatibleTypes, isDimension, isMeasure, strongestPair, suggestCharts } from './suggest';
import { buildDataset } from '../analysis/stats';
import type { CellValue, Dataset } from '../types';

function make(headers: string[], rows: CellValue[][]): Dataset {
	return buildDataset({ headers, rows, skippedEmptyRows: 0 }, { name: 'T', source: 'upload' });
}

/** 24 months of sales with a date, two categories and three measures. */
function salesLike(): Dataset {
	const rows: CellValue[][] = [];
	const regions = ['North', 'South', 'East', 'West'];
	const channels = ['Online', 'Retail'];
	for (let i = 0; i < 120; i++) {
		const month = (i % 24) + 1;
		const year = 2024 + Math.floor(month / 13);
		const m = ((month - 1) % 12) + 1;
		rows.push([
			`${year}-${String(m).padStart(2, '0')}-15`,
			regions[i % regions.length],
			channels[i % channels.length],
			String(1000 + i * 37),
			String(600 + i * 21), // strongly correlated with Revenue
			// Continuous and noisy, so it stays a measure rather than becoming a code set.
			String((((i * 97) % 211) + 3).toFixed(0))
		]);
	}
	return make(['Order Date', 'Region', 'Channel', 'Revenue', 'Cost', 'Units Sold'], rows);
}

describe('column roles', () => {
	it('recognises measures and rejects constants', () => {
		const ds = make(
			['Varying', 'Constant'],
			Array.from({ length: 20 }, (_, i) => [String(i), '5'])
		);
		expect(isMeasure(ds.columns[0])).toBe(true);
		// Every bar would be identical, so a constant is not a useful measure.
		expect(isMeasure(ds.columns[1])).toBe(false);
	});

	it('recognises dimensions within a readable cardinality band', () => {
		const good = make(
			['Region'],
			Array.from({ length: 40 }, (_, i) => [['N', 'S', 'E', 'W'][i % 4]])
		);
		expect(isDimension(good.columns[0])).toBe(true);

		// One value explains nothing.
		const single = make(['All'], Array.from({ length: 20 }, () => ['same']));
		expect(isDimension(single.columns[0])).toBe(false);
	});

	it('ranks the named business metric above an anonymous number', () => {
		const ds = salesLike();
		const roles = assignRoles(ds);
		expect(roles.primaryMeasure?.name).toBe('Revenue');
		expect(roles.primaryDate?.name).toBe('Order Date');
		expect(roles.primaryDimension).not.toBeNull();
	});
});

describe('suggestCharts', () => {
	it('leads with a trend when there is a date and a measure', () => {
		const specs = suggestCharts(salesLike());
		expect(specs.length).toBeGreaterThan(3);
		expect(specs[0].type).toBe('line');
		expect(specs[0].x).toBe('Order Date');
		expect(specs[0].y).toBe('Revenue');
	});

	it('gives every suggestion a human reason', () => {
		for (const spec of suggestCharts(salesLike())) {
			expect(spec.reason, spec.title).toBeTruthy();
			expect(spec.reason!.length).toBeGreaterThan(10);
		}
	});

	it('returns specs that are each renderable in principle', () => {
		for (const spec of suggestCharts(salesLike())) {
			expect(spec.id).toBeTruthy();
			expect(spec.title).toBeTruthy();
			expect(spec.span).toBeGreaterThanOrEqual(3);
			expect(spec.span).toBeLessThanOrEqual(12);
			// Heatmaps are the one type with no axis columns.
			if (spec.type !== 'heatmap') expect(spec.x).toBeTruthy();
		}
	});

	it('offers a correlation heatmap once there are three measures', () => {
		const specs = suggestCharts(salesLike());
		expect(specs.some((s) => s.type === 'heatmap')).toBe(true);
	});

	it('offers a scatter for a strong numeric relationship', () => {
		const specs = suggestCharts(salesLike());
		const scatter = specs.find((s) => s.type === 'scatter');
		expect(scatter).toBeDefined();
		expect(scatter!.reason).toMatch(/r = /);
	});

	it('ranks a top-N instead of charting hundreds of categories', () => {
		const rows: CellValue[][] = Array.from({ length: 300 }, (_, i) => [
			`Product ${i}`,
			String(100 + (i % 50) * 7)
		]);
		const specs = suggestCharts(make(['Product', 'Revenue'], rows));
		const topn = specs.find((s) => s.type === 'topn');
		expect(topn).toBeDefined();
		expect(topn!.limit).toBe(10);
	});

	it('counts rows when the data has no measures at all', () => {
		const rows: CellValue[][] = Array.from({ length: 60 }, (_, i) => [
			['N', 'S', 'E'][i % 3],
			['Online', 'Retail'][i % 2]
		]);
		const specs = suggestCharts(make(['Region', 'Channel'], rows));
		expect(specs.length).toBeGreaterThan(0);
		for (const spec of specs) expect(spec.agg).toBe('count');
	});

	it('still suggests something for a single-column table', () => {
		const rows: CellValue[][] = Array.from({ length: 30 }, (_, i) => [String(i * 3)]);
		const specs = suggestCharts(make(['Value'], rows));
		expect(specs.length).toBeGreaterThan(0);
		expect(specs.some((s) => s.type === 'histogram')).toBe(true);
	});

	it('respects the limit', () => {
		expect(suggestCharts(salesLike(), 3)).toHaveLength(3);
	});

	it('gives each card its own palette slot', () => {
		const specs = suggestCharts(salesLike());
		for (const spec of specs) {
			expect(spec.colorIndex).toBeGreaterThanOrEqual(0);
			expect(spec.colorIndex).toBeLessThan(10);
		}
	});
});

describe('strongestPair', () => {
	it('finds the most strongly related numeric pair', () => {
		const ds = salesLike();
		const roles = assignRoles(ds);
		const pair = strongestPair(ds, roles.measures);
		expect(pair).not.toBeNull();
		// Revenue and Cost were generated as a linear relationship.
		expect(Math.abs(pair!.r)).toBeGreaterThan(0.9);
		expect([pair!.a.name, pair!.b.name].sort()).toEqual(['Cost', 'Revenue']);
	});
});

describe('compatibleTypes', () => {
	it('offers trend types for a date axis', () => {
		const ds = salesLike();
		const types = compatibleTypes(ds, {
			id: 'c',
			title: 't',
			type: 'line',
			x: 'Order Date',
			y: 'Revenue',
			agg: 'sum'
		});
		expect(types).toContain('line');
		expect(types).toContain('area');
		// A pie of a time axis is never the right answer.
		expect(types).not.toContain('donut');
	});

	it('offers share types for a category axis', () => {
		const ds = salesLike();
		const types = compatibleTypes(ds, {
			id: 'c',
			title: 't',
			type: 'bar',
			x: 'Region',
			y: 'Revenue',
			agg: 'sum'
		});
		expect(types).toContain('donut');
		expect(types).toContain('topn');
	});

	it('locks a heatmap to itself', () => {
		const ds = salesLike();
		expect(
			compatibleTypes(ds, { id: 'c', title: 't', type: 'heatmap', x: null, y: null, agg: 'avg' })
		).toEqual(['heatmap']);
	});
});
