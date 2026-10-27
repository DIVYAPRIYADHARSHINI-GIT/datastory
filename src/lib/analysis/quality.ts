/**
 * Data quality report + the "analysis health score".
 *
 * The score is a transparent 100-point deduction model so the UI can explain it:
 *   -40 x missing-cell share      (weighted by how much of the table is blank)
 *   -20 x duplicate-row share
 *   -10 x empty-row share
 *   -10 x outlier-cell share (capped: outliers are often legitimate)
 *   -5   untrimmed whitespace present
 *   -5   mixed date formats present
 *   -5   per useless (constant / fully empty) column, max -10
 * Nothing in here mutates the dataset; cleaning lives in clean.ts.
 */

import type { Dataset, QualityIssue, QualityReport } from '../types';
import { isMissing } from './detect';

/** Row signature used for duplicate detection. */
function rowKey(row: unknown[]): string {
	return row.map((v) => (v === null || v === undefined ? '\u0000' : String(v))).join('\u001f');
}

export function findDuplicateRows(dataset: Dataset): number[] {
	const seen = new Map<string, number>();
	const dupes: number[] = [];
	for (let r = 0; r < dataset.rows.length; r++) {
		const key = rowKey(dataset.rows[r]);
		if (seen.has(key)) dupes.push(r);
		else seen.set(key, r);
	}
	return dupes;
}

export function findEmptyRows(dataset: Dataset): number[] {
	const empty: number[] = [];
	for (let r = 0; r < dataset.rows.length; r++) {
		let allMissing = true;
		for (const v of dataset.rows[r]) {
			if (!isMissing(v)) {
				allMissing = false;
				break;
			}
		}
		if (allMissing) empty.push(r);
	}
	return empty;
}

/** Cells whose string value has leading/trailing whitespace or doubled inner spaces. */
export function countUntrimmed(dataset: Dataset): number {
	let count = 0;
	for (const row of dataset.rows) {
		for (const v of row) {
			if (typeof v === 'string' && (v !== v.trim() || /\s{2,}/.test(v))) count++;
		}
	}
	return count;
}

function grade(score: number): QualityReport['grade'] {
	if (score >= 90) return 'excellent';
	if (score >= 75) return 'good';
	if (score >= 55) return 'fair';
	return 'poor';
}

function pct(share: number): string {
	const v = share * 100;
	if (v > 0 && v < 0.1) return '<0.1%';
	return `${v.toFixed(v >= 10 ? 0 : 1)}%`;
}

export function analyzeQuality(dataset: Dataset): QualityReport {
	const rowCount = dataset.rows.length;
	const colCount = dataset.columns.length;
	const totalCells = Math.max(1, rowCount * colCount);

	const duplicateRows = findDuplicateRows(dataset);
	const emptyRows = findEmptyRows(dataset);
	const untrimmedCells = countUntrimmed(dataset);

	let missingCells = 0;
	let outlierCells = 0;
	const issues: QualityIssue[] = [];

	const perColumn = dataset.columns.map((col) => {
		missingCells += col.missing;
		const outliers = col.numeric?.outlierCount ?? 0;
		outlierCells += outliers;
		return {
			column: col.name,
			type: col.type,
			missing: col.missing,
			missingShare: rowCount ? col.missing / rowCount : 0,
			distinctCount: col.distinctCount,
			outliers
		};
	});

	// --- per-column issues -------------------------------------------------
	for (const col of dataset.columns) {
		const share = rowCount ? col.missing / rowCount : 0;
		if (col.missing > 0 && share >= 1) {
			issues.push({
				kind: 'empty-column',
				column: col.name,
				count: col.missing,
				share,
				severity: 'critical',
				message: `"${col.name}" is completely empty and will be ignored by charts.`
			});
		} else if (share >= 0.3) {
			issues.push({
				kind: 'missing',
				column: col.name,
				count: col.missing,
				share,
				severity: 'critical',
				message: `${pct(share)} of "${col.name}" is missing (${col.missing} of ${rowCount} rows).`,
				fix: 'fill-missing'
			});
		} else if (share >= 0.05) {
			issues.push({
				kind: 'missing',
				column: col.name,
				count: col.missing,
				share,
				severity: 'warning',
				message: `${pct(share)} of "${col.name}" is missing (${col.missing} rows).`,
				fix: 'fill-missing'
			});
		} else if (col.missing > 0) {
			issues.push({
				kind: 'missing',
				column: col.name,
				count: col.missing,
				share,
				severity: 'info',
				message: `${col.missing} missing value${col.missing === 1 ? '' : 's'} in "${col.name}".`,
				fix: 'fill-missing'
			});
		}

		if (col.distinctCount === 1 && col.missing < rowCount) {
			issues.push({
				kind: 'constant-column',
				column: col.name,
				count: rowCount,
				share: 1,
				severity: 'info',
				message: `"${col.name}" has the same value in every row - it adds nothing to a chart.`
			});
		}

		const outliers = col.numeric?.outlierCount ?? 0;
		if (outliers > 0) {
			const oShare = rowCount ? outliers / rowCount : 0;
			issues.push({
				kind: 'outliers',
				column: col.name,
				count: outliers,
				share: oShare,
				severity: oShare >= 0.1 ? 'warning' : 'info',
				message: `${outliers} outlier${outliers === 1 ? '' : 's'} in "${col.name}" (outside 1.5x IQR).`
			});
		}

		if (col.type === 'date' && col.date && col.date.min === col.date.max && col.distinctCount > 1) {
			issues.push({
				kind: 'mixed-dates',
				column: col.name,
				count: col.distinctCount,
				share: 0,
				severity: 'warning',
				message: `Dates in "${col.name}" could not be read consistently.`,
				fix: 'standardize-dates'
			});
		}
	}

	// --- table-level issues -------------------------------------------------
	if (duplicateRows.length > 0) {
		const share = rowCount ? duplicateRows.length / rowCount : 0;
		issues.push({
			kind: 'duplicate-rows',
			count: duplicateRows.length,
			share,
			severity: share >= 0.05 ? 'warning' : 'info',
			message: `${duplicateRows.length} duplicate row${duplicateRows.length === 1 ? '' : 's'} (${pct(share)} of the table).`,
			fix: 'remove-duplicates'
		});
	}
	if (emptyRows.length > 0) {
		issues.push({
			kind: 'empty-rows',
			count: emptyRows.length,
			share: rowCount ? emptyRows.length / rowCount : 0,
			severity: 'warning',
			message: `${emptyRows.length} completely empty row${emptyRows.length === 1 ? '' : 's'}.`,
			fix: 'drop-empty-rows'
		});
	}
	if (untrimmedCells > 0) {
		issues.push({
			kind: 'untrimmed',
			count: untrimmedCells,
			share: untrimmedCells / totalCells,
			severity: 'info',
			message: `${untrimmedCells} cell${untrimmedCells === 1 ? '' : 's'} have extra spaces, which splits categories apart.`,
			fix: 'trim-spaces'
		});
	}

	// --- score --------------------------------------------------------------
	const missingShare = missingCells / totalCells;
	const dupShare = rowCount ? duplicateRows.length / rowCount : 0;
	const emptyShare = rowCount ? emptyRows.length / rowCount : 0;
	const outlierShare = outlierCells / totalCells;
	const uselessColumns = dataset.columns.filter(
		(c) => c.distinctCount <= 1 || c.missing >= rowCount
	).length;

	let score = 100;
	score -= Math.min(40, missingShare * 40 * 2.5);
	score -= Math.min(20, dupShare * 20 * 3);
	score -= Math.min(10, emptyShare * 10 * 5);
	score -= Math.min(10, outlierShare * 10 * 4);
	if (untrimmedCells > 0) score -= 5;
	if (issues.some((i) => i.kind === 'mixed-dates')) score -= 5;
	score -= Math.min(10, uselessColumns * 5);
	score = Math.max(0, Math.min(100, Math.round(score)));

	const severityRank = { critical: 0, warning: 1, info: 2 } as const;
	issues.sort(
		(a, b) => severityRank[a.severity] - severityRank[b.severity] || b.share - a.share
	);

	return {
		score,
		grade: grade(score),
		totalCells,
		missingCells,
		duplicateRows,
		emptyRows,
		untrimmedCells,
		outlierCells,
		issues,
		perColumn
	};
}

/** Short human summary of a report, used in the Story panel and the export header. */
export function describeQuality(report: QualityReport, rowCount: number): string {
	const parts: string[] = [`${rowCount.toLocaleString()} rows`];
	if (report.missingCells > 0) parts.push(`${report.missingCells.toLocaleString()} missing cells`);
	if (report.duplicateRows.length > 0) parts.push(`${report.duplicateRows.length} duplicates`);
	if (report.outlierCells > 0) parts.push(`${report.outlierCells} outliers`);
	if (parts.length === 1) parts.push('no quality issues found');
	return parts.join(' · ');
}
