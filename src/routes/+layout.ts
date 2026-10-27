// Static site: prerender every route, no SSR. All parsing/analysis is browser-only, so
// there is nothing meaningful to render on a server anyway.
export const prerender = true;
export const ssr = false;
export const trailingSlash = 'always';
