import { describe, expect, it } from 'vitest';
import {
	coerceValue,
	detectColumnType,
	isMissing,
	parseBoolean,
	parseDate,
	parseNumber
} from './detect';
import type { CellValue } from '../types';

/** Build a column of values as rows, which is what the detector expects. */
function column(values: CellValue[]): CellValue[][] {
	return values.map((v) => [v]);
}

describe('isMissing', () => {
	it('treats blanks, dashes and spreadsheet error tokens as missing', () => {
		for (const token of ['', '  ', '-', 'N/A', 'na', 'NULL', 'nan', '#DIV/0!', '?']) {
			expect(isMissing(token), token).toBe(true);
		}
	});

	it('does not treat real values as missing', () => {
		expect(isMissing('0')).toBe(false);
		expect(isMissing(0)).toBe(false);
		expect(isMissing(false)).toBe(false);
		expect(isMissing('North')).toBe(false);
	});

	it('treats NaN and Infinity as missing', () => {
		expect(isMissing(NaN)).toBe(true);
		expect(isMissing(Infinity)).toBe(true);
	});
});

describe('parseNumber', () => {
	it('reads plain numbers', () => {
		expect(parseNumber('42')).toBe(42);
		expect(parseNumber('-3.5')).toBe(-3.5);
		expect(parseNumber('.5')).toBe(0.5);
		expect(parseNumber(7)).toBe(7);
	});

	it('strips thousands separators', () => {
		expect(parseNumber('1,234')).toBe(1234);
		expect(parseNumber('1,234,567.89')).toBe(1234567.89);
	});

	it('reads European decimal commas', () => {
		expect(parseNumber('1.234,56')).toBe(1234.56);
		expect(parseNumber('1.234.567,89')).toBe(1234567.89);
	});

	it('strips currency symbols', () => {
		expect(parseNumber('₹2,500')).toBe(2500);
		expect(parseNumber('$1,299.99')).toBe(1299.99);
		expect(parseNumber('€45')).toBe(45);
	});

	it('reads accounting negatives', () => {
		expect(parseNumber('(350)')).toBe(-350);
		expect(parseNumber('(1,200.50)')).toBe(-1200.5);
	});

	it('drops a trailing percent sign but keeps the magnitude', () => {
		// 42% stays 42, not 0.42 - users expect the column to read as it was typed.
		expect(parseNumber('42%')).toBe(42);
	});

	it('reads scientific notation', () => {
		expect(parseNumber('1.2e3')).toBe(1200);
		expect(parseNumber('-2E-2')).toBe(-0.02);
	});

	it('rejects text and mixed content', () => {
		expect(parseNumber('North')).toBeNull();
		expect(parseNumber('12 units')).toBeNull();
		expect(parseNumber('--')).toBeNull();
		expect(parseNumber(true)).toBeNull();
	});
});

describe('parseBoolean', () => {
	it('reads the common yes/no spellings', () => {
		for (const t of ['true', 'TRUE', 'yes', 'Y', 't', '1', 'on', 'Active']) {
			expect(parseBoolean(t), t).toBe(true);
		}
		for (const f of ['false', 'No', 'n', 'f', '0', 'off', 'inactive']) {
			expect(parseBoolean(f), f).toBe(false);
		}
	});

	it('rejects anything else', () => {
		expect(parseBoolean('maybe')).toBeNull();
		expect(parseBoolean(42)).toBeNull();
	});
});

describe('parseDate', () => {
	const march14 = Date.UTC(2024, 2, 14);

	it('reads ISO dates', () => {
		expect(parseDate('2024-03-14')).toBe(march14);
		expect(parseDate('2024/03/14')).toBe(march14);
		expect(parseDate('2024-03-14T08:30:00')).toBe(Date.UTC(2024, 2, 14, 8, 30, 0));
	});

	it('reads day-first and month-first with the given preference', () => {
		expect(parseDate('14/03/2024', true)).toBe(march14);
		expect(parseDate('03/14/2024', false)).toBe(march14);
	});

	it('resolves unambiguous dates regardless of preference', () => {
		// 25 can only be a day, so month-first preference must not flip it.
		expect(parseDate('25/03/2024', false)).toBe(Date.UTC(2024, 2, 25));
		expect(parseDate('03/25/2024', true)).toBe(Date.UTC(2024, 2, 25));
	});

	it('reads month names in both orders', () => {
		expect(parseDate('14 Mar 2024')).toBe(march14);
		expect(parseDate('Mar 14, 2024')).toBe(march14);
		expect(parseDate('March 2024')).toBe(Date.UTC(2024, 2, 1));
	});

	it('reads quarters and ISO weeks', () => {
		expect(parseDate('Q2 2024')).toBe(Date.UTC(2024, 3, 1));
		expect(parseDate('2024 Q2')).toBe(Date.UTC(2024, 3, 1));
		// 2024-W01 starts Mon 1 Jan 2024.
		expect(parseDate('2024-W01')).toBe(Date.UTC(2024, 0, 1));
	});

	it('expands 2-digit years around the 50 boundary', () => {
		expect(parseDate('14/03/24')).toBe(march14);
		expect(parseDate('14/03/99')).toBe(Date.UTC(1999, 2, 14));
	});

	it('reads Excel serial numbers', () => {
		// 45365 = 2024-03-14 in the 1900 system.
		expect(parseDate(45365)).toBe(march14);
	});

	it('rejects impossible dates', () => {
		expect(parseDate('2024-02-31')).toBeNull();
		expect(parseDate('2024-13-01')).toBeNull();
		expect(parseDate('not a date')).toBeNull();
	});

	it('does not read short integers as dates', () => {
		// "12" is a quantity, not a date.
		expect(parseDate('12')).toBeNull();
		expect(parseDate('2024')).toBeNull();
	});
});

describe('detectColumnType', () => {
	it('detects a number column', () => {
		const result = detectColumnType('Revenue', column(['1200', '3400', '560', '7890', '230', '9900', '120', '4500']), 0);
		expect(result.type).toBe('number');
		expect(result.confidence).toBeGreaterThan(0.9);
	});

	it('detects a date column', () => {
		const rows = column(['2024-01-01', '2024-02-15', '2024-03-30', '2024-04-10', '2024-05-05']);
		expect(detectColumnType('Order Date', rows, 0).type).toBe('date');
	});

	it('detects a boolean column', () => {
		expect(detectColumnType('Churned', column(['Yes', 'No', 'Yes', 'Yes', 'No']), 0).type).toBe(
			'boolean'
		);
	});

	it('treats low-cardinality text as a category', () => {
		const rows = column([
			'North', 'South', 'East', 'West', 'North', 'South', 'East', 'West', 'North', 'South'
		]);
		expect(detectColumnType('Region', rows, 0).type).toBe('category');
	});

	it('treats high-cardinality text as text', () => {
		const rows = column(Array.from({ length: 40 }, (_, i) => `Customer note number ${i} is unique`));
		expect(detectColumnType('Notes', rows, 0).type).toBe('text');
	});

	it('keeps identifier-shaped numbers as text so nobody averages them', () => {
		const rows = column(Array.from({ length: 30 }, (_, i) => String(100000 + i)));
		expect(detectColumnType('Invoice Number', rows, 0).type).toBe('text');
	});

	it('treats small integer code sets as categories', () => {
		const rows = column(['1', '2', '3', '4', '5', '3', '4', '5', '2', '1', '5', '4']);
		expect(detectColumnType('Rating', rows, 0).type).toBe('category');
	});

	it('reads a 4-digit Year column as a date axis', () => {
		const rows = column(['2019', '2020', '2021', '2022', '2023', '2020', '2021']);
		expect(detectColumnType('Year', rows, 0).type).toBe('date');
	});

	it('flags a column that mixes d/m/y and m/d/y', () => {
		// 25/03 can only be day-first; 03/25 can only be month-first.
		const rows = column(['25/03/2024', '03/25/2024', '01/02/2024', '13/02/2024', '02/13/2024']);
		expect(detectColumnType('Signup', rows, 0).mixedDateOrder).toBe(true);
	});

	it('finds dirt that only appears at the bottom of a tall column', () => {
		// Stratified sampling is the point: a first-N sample would call this a clean number column.
		const values: CellValue[] = [
			...Array.from({ length: 900 }, () => '100'),
			...Array.from({ length: 600 }, () => 'not a number')
		];
		const result = detectColumnType('Amount', column(values), 0);
		expect(result.type).not.toBe('number');
	});

	it('returns text for an entirely empty column', () => {
		const result = detectColumnType('Blank', column(['', '', null, '  ']), 0);
		expect(result.type).toBe('text');
		expect(result.confidence).toBe(0);
	});
});

describe('coerceValue', () => {
	it('normalises values to the column type', () => {
		expect(coerceValue('₹1,200', 'number')).toBe(1200);
		expect(coerceValue('2024-03-14', 'date')).toBe(Date.UTC(2024, 2, 14));
		expect(coerceValue('Yes', 'boolean')).toBe(true);
	});

	it('preserves whitespace on text, so the cleaning step has something to report', () => {
		// Trimming here would hide " North " vs "North" from the quality panel entirely.
		expect(coerceValue('  North  ', 'category')).toBe('  North  ');
	});

	it('turns unparseable values into null so they count as missing', () => {
		expect(coerceValue('abc', 'number')).toBeNull();
		expect(coerceValue('N/A', 'number')).toBeNull();
		expect(coerceValue('maybe', 'boolean')).toBeNull();
	});
});
