import { describe, expect, it } from 'vitest';
import { ParseError, extensionOf, isExcel, normalizeHeaders, validateFile } from './parse';

/** Minimal File stand-in; validateFile only reads name and size. */
function fakeFile(name: string, size: number): File {
	return { name, size } as File;
}

describe('extensionOf / isExcel', () => {
	it('reads the extension case-insensitively', () => {
		expect(extensionOf('data.CSV')).toBe('.csv');
		expect(extensionOf('report.final.xlsx')).toBe('.xlsx');
		expect(extensionOf('noextension')).toBe('');
	});

	it('recognises Excel formats', () => {
		expect(isExcel('book.xlsx')).toBe(true);
		expect(isExcel('book.xls')).toBe(true);
		expect(isExcel('book.xlsm')).toBe(true);
		expect(isExcel('data.csv')).toBe(false);
	});
});

describe('validateFile', () => {
	it('accepts every supported format', () => {
		for (const name of ['a.csv', 'a.tsv', 'a.txt', 'a.xlsx', 'a.xls', 'a.xlsm']) {
			expect(() => validateFile(fakeFile(name, 1024)), name).not.toThrow();
		}
	});

	it('rejects an unsupported format with a usable hint', () => {
		try {
			validateFile(fakeFile('photo.pdf', 1024));
			expect.unreachable('should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(ParseError);
			expect((err as ParseError).message).toContain('.pdf');
			expect((err as ParseError).hint).toContain('.csv');
		}
	});

	it('rejects a file with no extension', () => {
		expect(() => validateFile(fakeFile('mydata', 1024))).toThrow(ParseError);
	});

	it('rejects an empty file', () => {
		try {
			validateFile(fakeFile('empty.csv', 0));
			expect.unreachable('should have thrown');
		} catch (err) {
			expect((err as ParseError).message).toContain('empty');
		}
	});

	it('rejects a file over the browser memory limit', () => {
		try {
			validateFile(fakeFile('huge.csv', 60 * 1024 * 1024));
			expect.unreachable('should have thrown');
		} catch (err) {
			expect((err as ParseError).message).toContain('50 MB');
			// The hint must explain WHY there is a limit, not just state it.
			expect((err as ParseError).hint).toContain('your device');
		}
	});
});

describe('normalizeHeaders', () => {
	it('keeps clean headers as they are', () => {
		expect(normalizeHeaders(['Region', 'Revenue'])).toEqual(['Region', 'Revenue']);
	});

	it('names blank headers by position', () => {
		expect(normalizeHeaders(['Region', '', '  ', 'Cost'])).toEqual([
			'Region',
			'Column 2',
			'Column 3',
			'Cost'
		]);
	});

	it('disambiguates duplicate headers', () => {
		// Charts key off column names, so duplicates must become distinct.
		expect(normalizeHeaders(['Total', 'Total', 'Total'])).toEqual([
			'Total',
			'Total (2)',
			'Total (3)'
		]);
	});

	it('treats duplicates case-insensitively', () => {
		expect(normalizeHeaders(['Total', 'total'])).toEqual(['Total', 'total (2)']);
	});

	it('strips a leftover UTF-8 BOM', () => {
		expect(normalizeHeaders(['\ufeffRegion'])).toEqual(['Region']);
	});

	it('coerces non-string headers', () => {
		expect(normalizeHeaders([2024, null, true])).toEqual(['2024', 'Column 2', 'true']);
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeHeaders(['  Region  '])).toEqual(['Region']);
	});
});
