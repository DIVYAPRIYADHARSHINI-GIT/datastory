/**
 * Settings store (Svelte 5 runes).
 *
 * Holds the theme, palette, number/date format and currency. The theme is applied to
 * <html> and mirrored to localStorage; the pre-paint script in app.html reads the same key
 * so there is no flash on reload.
 */

import { browser } from '$app/env';
import type { Settings, Theme } from '../types';
import { DEFAULT_SETTINGS, formatOptionsFrom, type FormatOptions } from '../format';
import { loadSettings, saveSettings, storageAvailable } from './storage';

class SettingsStore {
	current = $state<Settings>({ ...DEFAULT_SETTINGS });
	/** Resolved dark/light after 'system' is evaluated - charts need the concrete value. */
	isDark = $state(false);
	storageBlocked = $state(false);
	#mediaQuery: MediaQueryList | null = null;

	constructor() {
		if (!browser) return;
		this.current = loadSettings();
		this.storageBlocked = !storageAvailable();
		this.#mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		this.#mediaQuery.addEventListener('change', () => {
			if (this.current.theme === 'system') this.#applyTheme(false);
		});
		this.#applyTheme(false);
	}

	get fmt(): FormatOptions {
		return formatOptionsFrom(this.current);
	}

	#resolveDark(): boolean {
		if (this.current.theme === 'dark') return true;
		if (this.current.theme === 'light') return false;
		return this.#mediaQuery?.matches ?? false;
	}

	/** `animate` adds a short transition class so a manual toggle feels smooth. */
	#applyTheme(animate: boolean): void {
		if (!browser) return;
		const root = document.documentElement;
		const dark = this.#resolveDark();
		if (animate && this.current.animations) {
			root.classList.add('theme-animating');
			window.setTimeout(() => root.classList.remove('theme-animating'), 240);
		}
		root.classList.toggle('dark', dark);
		this.isDark = dark;
		const meta = document.querySelector('meta[name="theme-color"]');
		if (meta) meta.setAttribute('content', dark ? '#0b1020' : '#4f46e5');
	}

	update(patch: Partial<Settings>): void {
		const themeChanged = patch.theme !== undefined && patch.theme !== this.current.theme;
		this.current = { ...this.current, ...patch };
		saveSettings(this.current);
		if (themeChanged) this.#applyTheme(true);
	}

	setTheme(theme: Theme): void {
		this.update({ theme });
	}

	/** Toggle button: light <-> dark, always landing on an explicit choice. */
	toggleTheme(): void {
		this.setTheme(this.isDark ? 'light' : 'dark');
	}

	reset(): void {
		this.current = { ...DEFAULT_SETTINGS };
		saveSettings(this.current);
		this.#applyTheme(true);
	}
}

export const settings = new SettingsStore();
