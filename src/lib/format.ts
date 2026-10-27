/**
 * Number / date / currency formatting.
 *
 * Every formatter takes an explicit Settings-shaped options object rather than reading a
 * store, so charts, KPI cards, tables, exports and tests all format identically.
 * Indian grouping (1,23,456.78) is a first-class option because INR is a required currency.
 */

import type { DateFormat, NumberFormat, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
	theme: 'system',
	palette: 'signature',
	numberFormat: 'international',
	dateFormat: 'dmy',
	currency: '₹',
	decimals: 2,
	animations: true
};

export type FormatOptions = {
	numberFormat: NumberFormat;
	dateFormat: DateFormat;
	currency: string;
	decimals: number;
};

export function formatOptionsFrom(settings: Settings): FormatOptions {
	return {
		numberFormat: settings.numberFormat,
		dateFormat: settings.dateFormat,
		currency: settings.currency,
		decimals: settings.decimals
	};
}

const INTL_CACHE = new Map<string, Intl.NumberFormat>();

function intl(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
	const key = locale + JSON.stringify(opts);
	let f = INTL_CACHE.get(key);
	if (!f) {
		f = new Intl.NumberFormat(locale, opts);
		INTL_CACHE.set(key, f);
	}
	return f;
}

/** Decimal places that make a value readable without being noisy. */
function autoDecimals(value: number, max: number): number {
	const abs = Math.abs(value);
	if (Number.isInteger(value)) return 0;
	if (abs >= 1000) return 0;
	if (abs >= 100) return Math.min(1, max);
	if (abs >= 1) return Math.min(2, max);
	if (abs >= 0.01) return Math.min(3, max);
	return Math.min(4, max);
}

/** 1_234_567 -> "12.35L" (indian) / "1.23M" (international). */
export function compactNumber(value: number, opts: FormatOptions): string {
	const sign = value < 0 ? '-' : '';
	const abs = Math.abs(value);
	if (opts.numberFormat === 'indian') {
		if (abs >= 1e7) return `${sign}${trimZeros(abs / 1e7, 2)}Cr`;
		if (abs >= 1e5) return `${sign}${trimZeros(abs / 1e5, 2)}L`;
		if (abs >= 1e3) return `${sign}${trimZeros(abs / 1e3, 1)}K`;
		return formatNumber(value, opts);
	}
	if (abs >= 1e12) return `${sign}${trimZeros(abs / 1e12, 2)}T`;
	if (abs >= 1e9) return `${sign}${trimZeros(abs / 1e9, 2)}B`;
	if (abs >= 1e6) return `${sign}${trimZeros(abs / 1e6, 2)}M`;
	if (abs >= 1e3) return `${sign}${trimZeros(abs / 1e3, 1)}K`;
	return formatNumber(value, opts);
}

function trimZeros(value: number, decimals: number): string {
	return String(Number(value.toFixed(decimals)));
}

export function formatNumber(value: number | null | undefined, opts: FormatOptions): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—';
	const locale = opts.numberFormat === 'indian' ? 'en-IN' : 'en-US';
	if (opts.numberFormat === 'compact' && Math.abs(value) >= 1000) {
		return compactNumber(value, { ...opts, numberFormat: 'international' });
	}
	const decimals = autoDecimals(value, opts.decimals);
	return intl(locale, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	}).format(value);
}

export function formatInteger(value: number | null | undefined, opts: FormatOptions): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—';
	const locale = opts.numberFormat === 'indian' ? 'en-IN' : 'en-US';
	return intl(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatCurrency(value: number | null | undefined, opts: FormatOptions): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—';
	const sign = value < 0 ? '-' : '';
	const body =
		Math.abs(value) >= 100000
			? compactNumber(Math.abs(value), opts)
			: formatNumber(Math.abs(value), opts);
	return `${sign}${opts.currency}${body}`;
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—';
	return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(decimals)}%`;
}

export function formatSigned(value: number | null | undefined, decimals = 1): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—';
	const sign = value > 0 ? '+' : value < 0 ? '-' : '';
	return `${sign}${Math.abs(value).toFixed(decimals)}%`;
}

const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

function pad(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** Dates are stored as epoch ms and formatted from UTC parts so they never shift a day. */
export function formatDate(value: number | null | undefined, opts: FormatOptions): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—';
	const d = new Date(value);
	const day = d.getUTCDate();
	const month = d.getUTCMonth() + 1;
	const year = d.getUTCFullYear();
	if (opts.dateFormat === 'iso') return `${year}-${pad(month)}-${pad(day)}`;
	if (opts.dateFormat === 'mdy') return `${pad(month)}/${pad(day)}/${year}`;
	return `${pad(day)}/${pad(month)}/${year}`;
}

/** Axis labels for a bucketed trend: "Mar 2024", "W12 2024", "Q2 2024", "2024". */
export function formatBucket(
	value: number,
	bucket: 'day' | 'week' | 'month' | 'quarter' | 'year',
	opts: FormatOptions
): string {
	const d = new Date(value);
	const year = d.getUTCFullYear();
	switch (bucket) {
		case 'year':
			return String(year);
		case 'quarter':
			return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${year}`;
		case 'month':
			return `${MONTHS[d.getUTCMonth()]} ${year}`;
		case 'week': {
			const start = Date.UTC(year, 0, 1);
			const week = Math.floor((value - start) / (7 * 86400000)) + 1;
			return `W${week} ${year}`;
		}
		default:
			return formatDate(value, opts);
	}
}

/** "2.4 MB" */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "2 minutes ago" / "12 Mar 2024" for saved dashboards. */
export function formatRelative(at: number, now = Date.now()): string {
	const diff = now - at;
	if (diff < 60_000) return 'just now';
	if (diff < 3_600_000) {
		const m = Math.round(diff / 60_000);
		return `${m} minute${m === 1 ? '' : 's'} ago`;
	}
	if (diff < 86_400_000) {
		const h = Math.round(diff / 3_600_000);
		return `${h} hour${h === 1 ? '' : 's'} ago`;
	}
	if (diff < 7 * 86_400_000) {
		const d = Math.round(diff / 86_400_000);
		return `${d} day${d === 1 ? '' : 's'} ago`;
	}
	const d = new Date(at);
	return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Shorten a long label for an axis tick without cutting mid-word where avoidable. */
export function truncate(text: string, max = 22): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1).trimEnd()}…`;
}
