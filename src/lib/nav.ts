/**
 * Route helpers.
 *
 * SvelteKit 3 replaced the `base` string with `resolve()`, which prefixes the base path and
 * validates the route id at compile time. Centralising the ids here means a renamed route is
 * a type error rather than a dead link, and every component imports one object.
 */

import { resolve } from '$app/paths';

export const ROUTES = {
	home: resolve('/'),
	upload: resolve('/upload'),
	preview: resolve('/preview'),
	dashboard: resolve('/dashboard'),
	story: resolve('/story'),
	builder: resolve('/builder'),
	exportShare: resolve('/export'),
	dashboards: resolve('/dashboards'),
	settings: resolve('/settings'),
	help: resolve('/help')
} as const;

/** Compare a pathname to a route, ignoring the trailing slash the config adds. */
export function isRoute(pathname: string, route: string): boolean {
	const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
	return norm(pathname) === norm(route);
}
