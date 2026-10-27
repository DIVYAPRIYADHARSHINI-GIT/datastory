import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// DataStory is a pure static site: every byte of parsing and analysis happens in the
// browser, so there are NO server routes at all. adapter-static + prerender means the
// build output can be dropped on GitHub Pages / Vercel / Netlify unchanged.
//
// The SPA fallback is `200.html`, NOT `index.html`. Naming it index.html makes the adapter
// overwrite the prerendered landing page with a bare JS-only shell, which costs the real
// `<h1>`/description in the served HTML (bad for first paint and for anything reading the
// markup). Hosts rewrite unmatched paths to 200.html instead - see vercel.json.
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter({ fallback: '200.html', strict: false })
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
