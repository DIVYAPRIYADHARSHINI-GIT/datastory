<script lang="ts">
	/**
	 * Single inline-SVG icon set. No icon font, no dependency - every glyph is hand-written
	 * on a 24x24 grid with a 1.75 stroke so they stay crisp at 16-20px.
	 */
	type IconName =
		| 'upload'
		| 'file'
		| 'sheet'
		| 'chart'
		| 'story'
		| 'builder'
		| 'export'
		| 'settings'
		| 'sun'
		| 'moon'
		| 'check'
		| 'x'
		| 'alert'
		| 'info'
		| 'spark'
		| 'arrow-right'
		| 'arrow-left'
		| 'arrow-up'
		| 'arrow-down'
		| 'filter'
		| 'search'
		| 'trash'
		| 'copy'
		| 'download'
		| 'share'
		| 'expand'
		| 'collapse'
		| 'eye'
		| 'eye-off'
		| 'grip'
		| 'plus'
		| 'sort'
		| 'line'
		| 'bar'
		| 'hbar'
		| 'pie'
		| 'donut'
		| 'scatter'
		| 'histogram'
		| 'heatmap'
		| 'topn'
		| 'area'
		| 'broom'
		| 'shield'
		| 'cart'
		| 'people'
		| 'graduation'
		| 'churn'
		| 'dashboard'
		| 'help'
		| 'keyboard'
		| 'refresh'
		| 'save'
		| 'open'
		| 'duplicate'
		| 'chevron-down'
		| 'chevron-right'
		| 'lock'
		| 'clock'
		| 'link'
		| 'palette'
		| 'table'
		| 'menu';

	let {
		name,
		size = 18,
		class: className = '',
		stroke = 1.75
	}: { name: IconName; size?: number; class?: string; stroke?: number } = $props();

	// Each entry is the inner markup of a 24x24 viewBox.
	const paths: Record<IconName, string> = {
		upload: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M3.5 15v2.5A2.5 2.5 0 0 0 6 20h12a2.5 2.5 0 0 0 2.5-2.5V15"/>',
		file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
		sheet: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M9 9.5V20M15 9.5V20"/>',
		chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
		story: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M11 4h7.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H11"/><path d="M14 9h3M14 13h3"/>',
		builder: '<path d="M4 20V8M10 20v-6M16 20V4"/><path d="M19 9l2 2-2 2"/><path d="M2 20h20"/>',
		export: '<path d="M12 4v10m0-10 3.5 3.5M12 4 8.5 7.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/>',
		settings:
			'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.46V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.46-1 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.46V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.46 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.46 1z"/>',
		sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
		moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
		check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
		x: '<path d="M6 6l12 12M18 6 6 18"/>',
		alert: '<path d="M12 9v4.5M12 17h.01"/><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
		info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
		spark: '<path d="m12 3 1.9 5.4L19.5 10l-5.6 1.6L12 17l-1.9-5.4L4.5 10l5.6-1.6z"/><path d="M18.5 16.5 19.3 18.7 21.5 19.5 19.3 20.3 18.5 22.5 17.7 20.3 15.5 19.5 17.7 18.7z"/>',
		'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
		'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
		'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
		'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
		filter: '<path d="M3.5 5h17l-6.6 7.8v5.4L10.1 21v-8.2z"/>',
		search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
		trash: '<path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M6.5 7 7.4 19a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7"/><path d="M10.5 11v6M13.5 11v6"/>',
		copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
		download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
		share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
		expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
		collapse: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
		eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
		'eye-off': '<path d="M10.6 6a9.6 9.6 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.5 3.3M6.3 7.8A16.8 16.8 0 0 0 2.5 12S6 18.1 12 18.1a9.3 9.3 0 0 0 3.8-.8"/><path d="m9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m3 3 18 18"/>',
		grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		sort: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
		line: '<path d="M3 17l5-6 4 3 5-8"/><path d="M3 20h18"/>',
		area: '<path d="M3 16l5-5 4 3 5-7v9z" fill="currentColor" fill-opacity=".18"/><path d="M3 16l5-5 4 3 5-7"/><path d="M3 20h18"/>',
		bar: '<path d="M5 20v-7M10 20V6M15 20v-10M20 20v-4"/>',
		hbar: '<path d="M4 6h12M4 11h7M4 16h15"/>',
		pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M14.5 3.6A9 9 0 0 1 20.4 9.5h-5.9z"/>',
		donut: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v5"/>',
		scatter: '<circle cx="7" cy="16" r="1.5"/><circle cx="11" cy="11" r="1.5"/><circle cx="15" cy="13" r="1.5"/><circle cx="18" cy="7" r="1.5"/><circle cx="9" cy="7" r="1.5"/><path d="M3 20h18M3 20V3"/>',
		histogram: '<path d="M4 20v-4M8 20v-8M12 20V5M16 20v-9M20 20v-6"/><path d="M2 20h20"/>',
		heatmap:
			'<rect x="4" y="4" width="5" height="5" rx="1"/><rect x="10" y="4" width="5" height="5" rx="1" fill="currentColor" fill-opacity=".3"/><rect x="16" y="4" width="4" height="5" rx="1"/><rect x="4" y="10" width="5" height="5" rx="1" fill="currentColor" fill-opacity=".3"/><rect x="10" y="10" width="5" height="5" rx="1"/><rect x="16" y="10" width="4" height="5" rx="1" fill="currentColor" fill-opacity=".3"/><rect x="4" y="16" width="5" height="4" rx="1"/><rect x="10" y="16" width="5" height="4" rx="1" fill="currentColor" fill-opacity=".3"/><rect x="16" y="16" width="4" height="4" rx="1"/>',
		topn: '<path d="M4 6h13M4 11h9M4 16h5"/><circle cx="20" cy="6" r="1.2"/>',
		broom: '<path d="M14 4.5 9.5 9"/><path d="m11 6.5 6.5 6.5"/><path d="M8 10.5 4.5 18A2 2 0 0 0 6.3 21h8.4a2 2 0 0 0 1.8-2.9L13.5 11z"/><path d="M8.5 15h8"/>',
		shield: '<path d="M12 3.5 5 6.2v5.1c0 4.3 2.9 8.2 7 9.2 4.1-1 7-4.9 7-9.2V6.2z"/><path d="m9.2 12 2 2 3.6-3.6"/>',
		cart: '<circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/><path d="M3 4h2.2l2.3 11.1a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6"/>',
		people:
			'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.6a5.5 5.5 0 0 1 3 5.4"/>',
		graduation: '<path d="M12 4 2.5 8.5 12 13l9.5-4.5z"/><path d="M6.5 10.8V16c0 1.4 2.5 2.7 5.5 2.7s5.5-1.3 5.5-2.7v-5.2"/><path d="M21.5 8.5V14"/>',
		churn: '<path d="M4 7h9a4 4 0 0 1 0 8H8"/><path d="m10.5 12.5-2.5 2.5 2.5 2.5"/><path d="M17 17.5h3M17 20h3"/>',
		dashboard:
			'<rect x="3.5" y="3.5" width="7.5" height="7" rx="1.5"/><rect x="13" y="3.5" width="7.5" height="11" rx="1.5"/><rect x="3.5" y="12.5" width="7.5" height="8" rx="1.5"/><rect x="13" y="16.5" width="7.5" height="4" rx="1.5"/>',
		help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3"/><path d="M12 17h.01"/>',
		keyboard:
			'<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 13h.01M18 9.5h.01M8 15.5h8"/>',
		refresh: '<path d="M20 11a8 8 0 1 0-1.5 6"/><path d="M20 5v6h-6"/>',
		save: '<path d="M5 4h11l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
		open: '<path d="M14 4h6v6"/><path d="m20 4-8 8"/><path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"/>',
		duplicate: '<rect x="4" y="4" width="11" height="11" rx="2"/><path d="M9 19v.5A1.5 1.5 0 0 0 10.5 21H19a1.5 1.5 0 0 0 1.5-1.5V11A1.5 1.5 0 0 0 19 9.5h-.5"/>',
		'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
		'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
		lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
		clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>',
		link: '<path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.4 6.4"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.4-1.4"/>',
		palette:
			'<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2a1.7 1.7 0 0 1 1.3-2.8h1.6A4.1 4.1 0 0 0 20.5 11c0-4.1-3.8-7.5-8.5-7.5z"/><circle cx="8" cy="10" r="1.1"/><circle cx="12" cy="7.5" r="1.1"/><circle cx="16" cy="10" r="1.1"/>',
		table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M9.5 9.5v10"/>',
		menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
	focusable="false">{@html paths[name]}</svg
>
