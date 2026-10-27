import { describe, expect, it } from 'vitest';
import {
	applyCleanAction,
	autoClean,
	dropEmptyRows,
	fillMissing,
	removeDuplicates,
	standardizeDates,
	toCsv,
	trimSpaces
} from './clean';
import { analyzeQuality, countUntrimmed, findDuplicateRows, findEmptyRows } from './quality';
import { buildDataset } from './stats';
import type { CellValue, Dataset, RawTable } from '../types';

function make(headers: string[], rows: CellValue[][]): Dataset {
	const raw: RawTable = { headers, rows, skippedEmptyRows: 0 };
	return buildDataset(raw, { name: 'Test', source: 'upload' });
}

/** A small messy table with one of every problem the cleaner handles. */
function messy(): Dataset {
	return make(
		['Region', 'Revenue', 'Order Date'],
		[
			[' North ', '1000', '2024-01-10'],
			['South', '2000', '2024-02-10'],
			['South', '2000', '2024-02-10'], // exact duplicate
			['East', '', '2024-03-10'], // missing revenue
			['  West', '4000', '2024-04-10'], // untrimmed
			[null, null, null], // empty row
			['North', '3000', '2024-05-10']
		]
	);
}

describe('quality detection', () => {
	it('finds duplicate rows by their full signature', () => {
		expect(findDuplicateRows(messy())).toEqual([2]);
	});

	it('finds rows where every cell is missing', () => {
		expect(findEmptyRows(messy())).toEqual([5]);
	});

	it('counts cells with stray whitespace', () => {
		// ' North ' and '  West' - note the empty row's nulls do not count.
		expect(countUntrimmed(messy())).toBe(2);
	});
});

describe('removeDuplicates', () => {
	it('keeps the first copy and drops the rest', () => {
		const result = removeDuplicates(messy());
		expect(result.step.rowsRemoved).toBe(1);
		expect(result.dataset.rowCount).toBe(6);
		expect(result.step.label).toContain('1 duplicate row');
	});

	it('reports honestly when there is nothing to remove', () => {
		const clean = make(['A'], [['1'], ['2'], ['3']]);
		const result = removeDuplicates(clean);
		expect(result.step.rowsRemoved).toBe(0);
		// Same object back: no pointless re-summarise.
		expect(result.dataset).toBe(clean);
	});
});

describe('dropEmptyRows', () => {
	it('removes rows where every cell is blank', () => {
		const result = dropEmptyRows(messy());
		expect(result.step.rowsRemoved).toBe(1);
		expect(result.dataset.rowCount).toBe(6);
	});
});

describe('trimSpaces', () => {
	it('trims ends and collapses inner runs so categories merge', () => {
		const ds = make(
			['Region'],
			[[' North '], ['North'], ['North  Zone'], ['North Zone'], ['South']]
		);
		const result = trimSpaces(ds);
		expect(result.step.cellsChanged).toBe(2);
		const region = result.dataset.columns[0];
		// ' North ' -> 'North' and 'North  Zone' -> 'North Zone' collapses 5 values into 3.
		expect(region.distinctCount).toBe(3);
	});
});

describe('fillMissing', () => {
	const gappy = () =>
		make(
			['Score', 'Grade'],
			[['10'], ['20'], ['30'], ['40'], [''], ['']].map((v, i) => [
				v[0] ?? null,
				i < 4 ? 'A' : i === 4 ? 'A' : null
			])
		);

	it('fills numbers with the median', () => {
		const ds = make(['Score'], [['10'], ['20'], ['30'], ['1000'], [''], ['']]);
		const result = fillMissing(ds, 'median');
		expect(result.step.cellsChanged).toBe(2);
		// Median of 10/20/30/1000 is 25 - deliberately robust against the 1000 outlier.
		expect(result.dataset.rows[4][0]).toBe(25);
		expect(result.dataset.columns[0].missing).toBe(0);
	});

	it('fills numbers with the mean when asked', () => {
		const ds = make(['Score'], [['10'], ['20'], ['30'], ['40'], ['']]);
		const result = fillMissing(ds, 'mean');
		expect(result.dataset.rows[4][0]).toBe(25);
	});

	it('fills numbers with zero when asked', () => {
		const ds = make(['Score'], [['10'], ['20'], ['30'], ['40'], ['']]);
		expect(fillMissing(ds, 'zero').dataset.rows[4][0]).toBe(0);
	});

	it('falls back to mode for text columns under a numeric strategy', () => {
		const ds = make(['Region'], [['North'], ['North'], ['South'], ['North'], ['']]);
		const result = fillMissing(ds, 'median');
		// Mean/median make no sense for text, so the most common value is used instead.
		expect(result.dataset.rows[4][0]).toBe('North');
	});

	it('never invents a date from an average', () => {
		const ds = make(
			['When'],
			[['2024-01-01'], ['2024-01-01'], ['2024-06-01'], ['2024-12-01'], ['']]
		);
		const result = fillMissing(ds, 'mean');
		// Mode, not mean: 2024-01-01 appears twice.
		expect(result.dataset.rows[4][0]).toBe(Date.UTC(2024, 0, 1));
	});

	it('drops rows instead of filling when asked', () => {
		const ds = make(['Score'], [['10'], ['20'], [''], ['40']]);
		const result = fillMissing(ds, 'drop-row');
		expect(result.step.rowsRemoved).toBe(1);
		expect(result.dataset.rowCount).toBe(3);
	});

	it('limits the fill to the named columns', () => {
		const ds = make(
			['A', 'B'],
			[
				['1', '10'],
				['2', '20'],
				['', ''],
				['4', '40']
			]
		);
		const result = fillMissing(ds, 'zero', ['A']);
		expect(result.dataset.rows[2][0]).toBe(0);
		expect(result.dataset.rows[2][1]).toBeNull();
	});
});

describe('standardizeDates', () => {
	it('reports when every date already parsed', () => {
		const ds = make(['When'], [['2024-01-01'], ['2024-02-01'], ['2024-03-01'], ['2024-04-01']]);
		const result = standardizeDates(ds);
		expect(result.step.cellsChanged).toBe(0);
		expect(result.step.label).toContain('already');
	});

	it('does nothing when there are no date columns', () => {
		const ds = make(['A'], [['1'], ['2'], ['3']]);
		expect(standardizeDates(ds).step.label).toContain('No date columns');
	});
});

describe('autoClean', () => {
	it('fixes every problem and only logs steps that changed something', () => {
		const { dataset, steps } = autoClean(messy());
		const report = analyzeQuality(dataset);

		expect(report.duplicateRows).toHaveLength(0);
		expect(report.emptyRows).toHaveLength(0);
		expect(report.untrimmedCells).toBe(0);
		expect(report.missingCells).toBe(0);
		// Every logged step must have actually done something.
		for (const step of steps) {
			expect(step.rowsRemoved + step.cellsChanged).toBeGreaterThan(0);
		}
	});

	it('raises the health score', () => {
		const dirty = messy();
		const before = analyzeQuality(dirty).score;
		const after = analyzeQuality(autoClean(dirty).dataset).score;
		expect(after).toBeGreaterThan(before);
	});

	it('trims before de-duplicating, so whitespace-only duplicates are caught', () => {
		// ' North ' and 'North' are not byte-identical rows until the trim runs.
		const ds = make(['Region', 'Value'], [[' North ', '1'], ['North', '1'], ['South', '2']]);
		const { dataset } = autoClean(ds);
		expect(dataset.rowCount).toBe(2);
	});

	it('does not mutate the input dataset', () => {
		const original = messy();
		const rowCountBefore = original.rowCount;
		autoClean(original);
		expect(original.rowCount).toBe(rowCountBefore);
		expect(original.rows[0][0]).toBe(' North ');
	});
});

describe('applyCleanAction', () => {
	it('dispatches every action id', () => {
		const ds = messy();
		for (const action of [
			{ id: 'remove-duplicates' },
			{ id: 'drop-empty-rows' },
			{ id: 'trim-spaces' },
			{ id: 'standardize-dates' },
			{ id: 'fill-missing', strategy: 'median' }
		] as const) {
			expect(() => applyCleanAction(ds, action)).not.toThrow();
		}
	});
});

describe('toCsv', () => {
	const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

	it('round-trips headers, values and types', () => {
		const ds = make(
			['Region', 'Revenue', 'When', 'Shipped'],
			[
				['North', '1000', '2024-01-10', 'Yes'],
				['South', '2000', '2024-02-10', 'No'],
				['East', '3000', '2024-03-10', 'Yes'],
				['West', '4000', '2024-04-10', 'No']
			]
		);
		const csv = toCsv(ds, iso);
		const lines = csv.replace(/^\ufeff/, '').trim().split('\r\n');
		expect(lines[0]).toBe('Region,Revenue,When,Shipped');
		expect(lines[1]).toBe('North,1000,2024-01-10,TRUE');
		expect(lines).toHaveLength(5);
	});

	it('starts with a BOM so Excel reads UTF-8 correctly', () => {
		const ds = make(['A'], [['1'], ['2'], ['3']]);
		expect(toCsv(ds, iso).startsWith('\ufeff')).toBe(true);
	});

	it('quotes values that contain commas, quotes or newlines', () => {
		const ds = make(
			['Note'],
			[['plain'], ['has, comma'], ['has "quote"'], ['has\nnewline'], ['another']]
		);
		const csv = toCsv(ds, iso);
		expect(csv).toContain('"has, comma"');
		expect(csv).toContain('"has ""quote"""');
		expect(csv).toContain('"has\nnewline"');
	});

	it('writes missing values as empty fields, not the string "null"', () => {
		const ds = make(['A', 'B'], [['1', ''], ['2', 'x'], ['3', 'y'], ['4', 'z']]);
		const csv = toCsv(ds, iso);
		expect(csv).not.toContain('null');
		expect(csv.replace(/^\ufeff/, '').split('\r\n')[1]).toBe('1,');
	});
});
