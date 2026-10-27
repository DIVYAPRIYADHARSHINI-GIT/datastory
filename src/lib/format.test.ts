import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	compactNumber,
	formatBucket,
	formatBytes,
	formatCurrency,
	formatDate,
	formatInteger,
	formatNumber,
	formatOptionsFrom,
	formatPercent,
	formatRelative,
	truncate,
	type FormatOptions
} from './format';

const intl: FormatOptions = formatOptionsFrom({ ...DEFAULT_SETTINGS, numberFormat: 'international' });
const indian: FormatOptions = formatOptionsFrom({ ...DEFAULT_SETTINGS, numberFormat: 'indian' });

describe('formatNumber', () => {
	it('groups with international separators', () => {
		expect(formatNumber(1234567.89, intl)).toBe('1,234,568');
		expect(formatNumber(1234, intl)).toBe('1,234');
	});

	it('groups in lakh/crore style for Indian format', () => {
		expect(formatNumber(1234567, indian)).toBe('12,34,567');
		expect(formatNumber(123456, indian)).toBe('1,23,456');
	});

	it('picks a sensible number of decimals for the magnitude', () => {
		// Big numbers do not need decimals; small ones do.
		expect(formatNumber(5000.456, intl)).toBe('5,000');
		expect(formatNumber(5.456, intl)).toBe('5.46');
		expect(formatNumber(42, intl)).toBe('42');
	});

	it('never exceeds the configured decimal ceiling', () => {
		// Default ceiling is 2 decimals, so a small value is rounded rather than padded.
		expect(formatNumber(0.0456, intl)).toBe('0.05');
		// Raising the ceiling lets more precision through, up to the per-magnitude cap.
		expect(formatNumber(0.0456, { ...intl, decimals: 4 })).toBe('0.046');
		expect(formatNumber(5.4567, { ...intl, decimals: 0 })).toBe('5');
	});

	it('shows an em dash for missing or non-finite values', () => {
		expect(formatNumber(null, intl)).toBe('—');
		expect(formatNumber(undefined, intl)).toBe('—');
		expect(formatNumber(NaN, intl)).toBe('—');
		expect(formatNumber(Infinity, intl)).toBe('—');
	});
});

describe('compactNumber', () => {
	it('uses K/M/B for international', () => {
		expect(compactNumber(1500, intl)).toBe('1.5K');
		expect(compactNumber(2_500_000, intl)).toBe('2.5M');
		expect(compactNumber(3_200_000_000, intl)).toBe('3.2B');
	});

	it('uses K/L/Cr for Indian', () => {
		expect(compactNumber(150_000, indian)).toBe('1.5L');
		expect(compactNumber(25_000_000, indian)).toBe('2.5Cr');
		expect(compactNumber(5000, indian)).toBe('5K');
	});

	it('keeps the sign', () => {
		expect(compactNumber(-2_500_000, intl)).toBe('-2.5M');
	});

	it('leaves small numbers alone', () => {
		expect(compactNumber(42, intl)).toBe('42');
	});
});

describe('formatCurrency', () => {
	it('prefixes the configured symbol', () => {
		expect(formatCurrency(1234, { ...intl, currency: '₹' })).toBe('₹1,234');
		expect(formatCurrency(1234, { ...intl, currency: '$' })).toBe('$1,234');
	});

	it('compacts large amounts so KPI cards do not overflow', () => {
		expect(formatCurrency(2_500_000, { ...indian, currency: '₹' })).toBe('₹25Cr'.replace('25Cr', '25L'));
	});

	it('puts the minus before the symbol', () => {
		expect(formatCurrency(-500, { ...intl, currency: '$' })).toBe('-$500');
	});
});

describe('formatPercent and formatInteger', () => {
	it('formats percentages with a fixed precision', () => {
		expect(formatPercent(12.345)).toBe('12.3%');
		expect(formatPercent(-8.4)).toBe('-8.4%');
		expect(formatPercent(null)).toBe('—');
	});

	it('formats integers without decimals', () => {
		expect(formatInteger(1234.9, intl)).toBe('1,235');
		expect(formatInteger(1234567, indian)).toBe('12,34,567');
	});
});

describe('formatDate', () => {
	const march14 = Date.UTC(2024, 2, 14);

	it('respects the chosen order', () => {
		expect(formatDate(march14, { ...intl, dateFormat: 'dmy' })).toBe('14/03/2024');
		expect(formatDate(march14, { ...intl, dateFormat: 'mdy' })).toBe('03/14/2024');
		expect(formatDate(march14, { ...intl, dateFormat: 'iso' })).toBe('2024-03-14');
	});

	it('reads UTC parts so the day never shifts by time zone', () => {
		// Late-evening UTC must still be the 14th regardless of the machine's zone.
		expect(formatDate(Date.UTC(2024, 2, 14, 23, 59), { ...intl, dateFormat: 'iso' })).toBe(
			'2024-03-14'
		);
	});
});

describe('formatBucket', () => {
	const ts = Date.UTC(2024, 2, 14);

	it('labels each bucket readably', () => {
		expect(formatBucket(ts, 'year', intl)).toBe('2024');
		expect(formatBucket(ts, 'quarter', intl)).toBe('Q1 2024');
		expect(formatBucket(ts, 'month', intl)).toBe('Mar 2024');
		expect(formatBucket(ts, 'day', intl)).toBe('14/03/2024');
		expect(formatBucket(ts, 'week', intl)).toMatch(/^W\d+ 2024$/);
	});
});

describe('formatBytes', () => {
	it('scales to B, KB and MB', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
	});
});

describe('formatRelative', () => {
	const now = Date.UTC(2024, 5, 15, 12, 0, 0);

	it('describes recent times in words', () => {
		expect(formatRelative(now - 30_000, now)).toBe('just now');
		expect(formatRelative(now - 5 * 60_000, now)).toBe('5 minutes ago');
		expect(formatRelative(now - 2 * 3_600_000, now)).toBe('2 hours ago');
		expect(formatRelative(now - 3 * 86_400_000, now)).toBe('3 days ago');
	});

	it('singularises correctly', () => {
		expect(formatRelative(now - 60_000, now)).toBe('1 minute ago');
		expect(formatRelative(now - 86_400_000, now)).toBe('1 day ago');
	});

	it('switches to an absolute date beyond a week', () => {
		expect(formatRelative(Date.UTC(2024, 2, 14), now)).toMatch(/Mar 2024/);
	});
});

describe('truncate', () => {
	it('leaves short labels alone and ellipsises long ones', () => {
		expect(truncate('Short', 22)).toBe('Short');
		const long = truncate('A very long axis label that will not fit', 20);
		expect(long.length).toBeLessThanOrEqual(20);
		expect(long.endsWith('…')).toBe(true);
	});
});
