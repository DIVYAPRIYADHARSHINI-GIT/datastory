/**
 * Browser-storage layer.
 *
 * Everything DataStory persists lives in localStorage under versioned keys, behind this
 * one module so quota failures, private-mode blocks and schema migrations are handled in
 * a single place. Saved dashboards include their cleaned dataset, which can be large, so
 * writes degrade gracefully: on QuotaExceededError the oldest dashboard is dropped and the
 * write is retried before giving up with a readable error.
 */

import type { SavedDashboard, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../format';

export const SETTINGS_KEY = 'datastory:settings:v1';
export const DASHBOARDS_KEY = 'datastory:dashboards:v1';
export const SCHEMA_VERSION = 1;

export class StorageError extends Error {
	readonly hint: string;
	constructor(message: string, hint = '') {
		super(message);
		this.name = 'StorageError';
		this.hint = hint;
	}
}

function storage(): Storage | null {
	try {
		if (typeof localStorage === 'undefined') return null;
		// Touch it: Safari private mode throws on write, not on access.
		const probe = '__datastory_probe__';
		localStorage.setItem(probe, '1');
		localStorage.removeItem(probe);
		return localStorage;
	} catch {
		return null;
	}
}

export function storageAvailable(): boolean {
	return storage() !== null;
}

function readJson<T>(key: string, fallback: T): T {
	const store = storage();
	if (!store) return fallback;
	try {
		const raw = store.getItem(key);
		if (!raw) return fallback;
		return JSON.parse(raw) as T;
	} catch {
		// Corrupt entry - do not take the app down over it.
		return fallback;
	}
}

function writeJson(key: string, value: unknown): void {
	const store = storage();
	if (!store) {
		throw new StorageError(
			'This browser is blocking local storage.',
			'DataStory saves dashboards on your device only. Turn off private browsing or allow site data to save your work.'
		);
	}
	store.setItem(key, JSON.stringify(value));
}

/* -------------------------------- settings -------------------------------- */

export function loadSettings(): Settings {
	const saved = readJson<Partial<Settings>>(SETTINGS_KEY, {});
	return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveSettings(settings: Settings): void {
	try {
		writeJson(SETTINGS_KEY, settings);
	} catch {
		// Settings are a nice-to-have; never block the UI on them.
	}
}

/* ------------------------------- dashboards ------------------------------- */

type DashboardFile = { version: number; dashboards: SavedDashboard[] };

export function loadDashboards(): SavedDashboard[] {
	const file = readJson<DashboardFile>(DASHBOARDS_KEY, { version: SCHEMA_VERSION, dashboards: [] });
	if (!Array.isArray(file.dashboards)) return [];
	return [...file.dashboards].sort((a, b) => b.updatedAt - a.updatedAt);
}

function persist(dashboards: SavedDashboard[]): void {
	const file: DashboardFile = { version: SCHEMA_VERSION, dashboards };
	try {
		writeJson(DASHBOARDS_KEY, file);
	} catch (err) {
		const quota =
			err instanceof DOMException &&
			(err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
		if (!quota || dashboards.length <= 1) {
			if (err instanceof StorageError) throw err;
			throw new StorageError(
				'There is not enough space left in this browser to save the dashboard.',
				'Delete an older dashboard from "My dashboards" and try again. Large datasets take up the most room.'
			);
		}
		// Drop the oldest and retry once.
		const trimmed = [...dashboards].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, -1);
		try {
			writeJson(DASHBOARDS_KEY, { version: SCHEMA_VERSION, dashboards: trimmed });
		} catch {
			throw new StorageError(
				'This dashboard is too large to save in browser storage.',
				'Try filtering the data down or removing some rows before saving. Everything stays on your device, so the browser limit applies.'
			);
		}
	}
}

export function saveDashboard(dashboard: SavedDashboard): SavedDashboard[] {
	const all = loadDashboards();
	const index = all.findIndex((d) => d.id === dashboard.id);
	if (index >= 0) all[index] = dashboard;
	else all.unshift(dashboard);
	persist(all);
	return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteDashboard(id: string): SavedDashboard[] {
	const all = loadDashboards().filter((d) => d.id !== id);
	persist(all);
	return all;
}

export function getDashboard(id: string): SavedDashboard | undefined {
	return loadDashboards().find((d) => d.id === id);
}

export function duplicateDashboard(id: string): SavedDashboard | undefined {
	const source = getDashboard(id);
	if (!source) return undefined;
	const copy: SavedDashboard = {
		...source,
		id: `dash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
		name: `${source.name} (copy)`,
		createdAt: Date.now(),
		updatedAt: Date.now()
	};
	saveDashboard(copy);
	return copy;
}

/** Approximate bytes used, so Settings can show a storage meter. */
export function storageUsage(): { bytes: number; dashboards: number } {
	const store = storage();
	if (!store) return { bytes: 0, dashboards: 0 };
	const raw = store.getItem(DASHBOARDS_KEY) ?? '';
	return { bytes: raw.length * 2, dashboards: loadDashboards().length };
}

export function clearAll(): void {
	const store = storage();
	if (!store) return;
	store.removeItem(DASHBOARDS_KEY);
	store.removeItem(SETTINGS_KEY);
}
