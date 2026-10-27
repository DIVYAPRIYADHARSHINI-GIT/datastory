# DataStory

> **Turn any spreadsheet into a story.**

A professional data-to-dashboard web app. Upload a CSV or Excel file and DataStory cleans
it, detects what each column actually is, and generates KPI cards, charts and written
insights — a raw spreadsheet becomes a shareable dashboard in under a minute.

**Everything runs in the browser.** There is no server, no account and no upload. Your file
is parsed, cleaned, charted and exported inside the tab; saved dashboards live in that
browser's local storage. Close the tab without saving and the data is simply gone.

---

## Why it exists

Students, analysts, small business owners and managers have spreadsheets but no time or
skill to build dashboards. Power BI and Tableau want a model; Excel wants formulas.
DataStory wants a file.

## Status

| Check | Result |
| --- | --- |
| Unit tests (`npm test`) | **253 passing** |
| Browser e2e checks (`npm run probe`) | **50 passing** in headless Chrome against the production build |
| `svelte-check` | **0 errors, 0 warnings** |
| Console errors across the full journey | **0** |
| Horizontal overflow at 390 px, every page | **0 px** |

---

## Running it

```bash
npm install
npm run dev        # dev server
npm run build      # static site -> build/
npm run preview    # serve the production build
npm test           # unit tests
npm run probe      # headless-Chrome end-to-end checks (builds first)
npm run check      # svelte-check
```

Regenerate the bundled sample datasets (deterministic, fixed seed):

```bash
node scripts/make-samples.mjs
```

### Deploying

`@sveltejs/adapter-static` with `prerender` + `ssr: false` emits a plain static site in
`build/`. Drop it on GitHub Pages, Vercel, Netlify or any static host — no runtime, no env
vars, no serverless functions. There are **no server routes at all**.

---

## The pipeline

Each stage is a pure function over plain data, so every stage is unit-testable in isolation
and the UI is a thin layer on top:

```
File ─▶ RawTable ─▶ Dataset (typed) ─▶ QualityReport ─▶ CleanPlan ─▶ Dataset
                         │
                         ├─▶ FilterState ─▶ rows ─▶ ChartSpec[] ─▶ ChartData ─▶ ECharts option
                         ├─▶ KpiSpec[] ─▶ KpiValue[]
                         └─▶ Insight[]
```

| Module | Responsibility |
| --- | --- |
| `src/lib/data/parse.ts` | CSV (PapaParse) and Excel (SheetJS) reading, validation, header normalisation |
| `src/lib/analysis/detect.ts` | Column type detection and value coercion |
| `src/lib/analysis/stats.ts` | Descriptive statistics and the `Dataset` builder |
| `src/lib/analysis/quality.ts` | Quality findings and the health score |
| `src/lib/analysis/clean.ts` | One-click cleaning actions and CSV output |
| `src/lib/charts/suggest.ts` | **Chart-suggestion logic** — which charts suit these columns, and why |
| `src/lib/charts/aggregate.ts` | Filtering, grouping, bucketing, aggregation |
| `src/lib/charts/kpis.ts` | KPI selection and evaluation |
| `src/lib/charts/options.ts` | ECharts option builders |
| `src/lib/charts/palette.ts` | Chart palettes, with separate light/dark variants |
| `src/lib/insights/generate.ts` | **Insight-generation logic** — the written story |
| `src/lib/export/` | PDF, PNG, CSV and thumbnail generation |
| `src/lib/stores/` | Project state, settings, local storage |

---

## How the clever parts work

### Column type detection

Conservative and explainable. It samples up to 1,000 values **stratified across the whole
table** (not the first N rows, so a column that only turns dirty near the bottom is still
caught), scores each candidate type, and requires ≥ 80 % of the sample to commit. Below
that, the column stays text.

- Numbers understand `1,234.50`, `₹2,500`, `(350)` → −350, `1.234,56` (European), `42 %`, `1.2e3`
- Dates understand ISO, `d/m/y`, `m/d/y`, `14 Mar 2024`, `Mar 14, 2024`, `2024-W12`,
  `Q1 2024` and Excel serial numbers — and resolve the genuinely ambiguous `03/04/2024` case
  once per column, so one column never mixes both readings
- Small integer code sets (ratings 1–5, store 1–8) become **categories**, because they group
  better than they sum
- Identifier-shaped columns (`Invoice Number`, `Order ID`) stay **text**, so nobody
  accidentally averages an invoice number

Every detected type is shown in the preview header and can be overridden by hand.

### Analysis health score

A transparent 100-point deduction model, not a vibe: up to −40 for missing cells, −20
duplicates, −10 empty rows, −10 outliers, −5 stray whitespace, −5 mixed date formats, −5 per
useless column (capped at −10). The quality panel lists every deduction, and the cleaning
screen shows the before/after.

Cleaning order matters and is deliberate: structural fixes → trim → date normalisation →
de-duplicate (trimming reveals *new* duplicates) → fill.

### Chart suggestion

Ranked rules, each carrying the `reason` string shown under the card title:

| Pattern | Chart | Score |
| --- | --- | --- |
| date + measure | line trend | 100 |
| category + measure | bar comparison | 85 |
| low-cardinality category | donut share | 70 |
| high-cardinality text + measure | top-10 ranking | 65 |
| measure | histogram | 55 |
| strongest numeric pair | scatter | 50 + 40·\|r\| |
| 3+ measures | correlation heatmap | 45 |

Measures are ranked in tiers so the dashboard opens on the right column: outcome beats input
(Revenue over Cost) and top line beats derived line (Revenue over Profit). Dimensions prefer
real nominal groupings (Region, Channel) over numeric code sets, so you get
"Revenue by Region" rather than three charts of "Revenue by Quantity".

The global slicers are drawn from the **same** ranking, so the columns you can filter are the
columns the dashboard actually charts.

### Insight generation

Statistics, not a language model — every sentence is reproducible from your file:
period-over-period change, share of total, Pareto concentration, Pearson correlation, Tukey
outlier fences, mean-vs-median skew, and the quality report.

Two things it deliberately refuses to do:

- **It will not report a partial final period as a collapse.** Real exports end mid-period; a
  file running to 1 July has one day of July in it. Naively comparing that stub to a full June
  yields "Revenue fell 97 % in July", which is false. DataStory detects the partial bucket,
  excludes it from the trend and growth figures, and says so in plain language.
- **It never implies causation.** Correlation insights carry the caveat explicitly.

---

## Pages

| Route | What it does |
| --- | --- |
| `/` | Landing: hero, 3-step explainer, features, sample dashboard preview (hand-drawn SVG, so the page loads no chart library) |
| `/upload` | Drag-and-drop + browse, Excel sheet selector, validation with specific error messages, 4 sample datasets |
| `/preview` | 100-row preview with sticky header, sort and search; per-column type pickers; quality panel; one-click cleaning; health score with before/after |
| `/dashboard` | KPI cards with sparklines, auto-suggested charts, global slicers, click-to-cross-filter, per-card type/fullscreen/PNG/hide/remove, drag to rearrange, drag to resize |
| `/story` | Written insights grouped by kind, tagged Info / Warning / Highlight, each linking to the chart that proves it, plus "Copy insights" |
| `/builder` | Pick X, Y, aggregation, group-by, chart type and colour; live preview; add to dashboard |
| `/export` | PDF report, dashboard PNG, cleaned CSV, save to My Dashboards, share link |
| `/dashboards` | Saved dashboards with inline SVG thumbnails: open, duplicate, delete |
| `/settings` | Theme, chart palette, number format (international / Indian lakh-crore / compact), date format, currency (incl. ₹), decimals |
| `/help` | FAQ, privacy, keyboard shortcuts, glossary |

### Keyboard shortcuts

`U` upload · `P` data · `D` dashboard · `S` story · `B` builder · `C` clear filters ·
`T` theme · `?` shortcut list · `Alt+←/→` move card · `Alt+↑/↓` resize card · `Esc` close

---

## Design system

Calm neutral base, **one** strong accent (indigo), and a **separate chart palette with
distinct light and dark variants** — reusing the same hex in both modes is the usual reason
BI tools look broken in dark mode. Five palettes ship (Signature, Ocean, Sunset, Forest,
Monochrome), each tuned twice.

Every surface and text token is a CSS variable swapped by a `.dark` class, applied before
first paint by an inline script so there is no flash. Theme transitions animate once,
globally. `prefers-reduced-motion` is respected throughout.

---

## Handling large files

- CSV is read in **1 MB chunks** so the event loop gets a turn and the page keeps painting.
  (PapaParse's `worker: true` is deliberately *not* used — it loads a second copy of itself
  from its own script URL, which does not exist in a bundled, hashed build.)
- Parsing stops at 200,000 rows and says so, rather than silently analysing a subset
- The preview table draws 100 rows; scatter plots sample to 4,000 points
- KPIs and chart aggregates always run across **every** row
- Column summaries are computed once and reused by the preview, quality report, suggester
  and insight generator

## Error handling

Every failure names the cause and a fix: unsupported format, empty file, over the 50 MB
browser limit, password-protected workbook, sheet with no data, header-only CSV, ragged
rows, a title row above the header, blocked local storage, and browser storage quota (which
drops the oldest dashboard and retries before giving up).

---

## Sample datasets

Generated by `scripts/make-samples.mjs` with a fixed-seed PRNG, so they are byte-identical
on every run and the tests can assert exact numbers. Each is realistic **and deliberately
imperfect**, so the cleaning tools have real work to do.

| Dataset | Rows | Built-in story | Seeded problems |
| --- | --- | --- | --- |
| Retail Sales | 6,561 | Diwali peak, March slump, West leads, revenue↔profit r ≈ 0.99 | 18 duplicates, 25 blank revenues, 40 untrimmed regions, 1 extra-zero outlier |
| HR / Employees | 486 | Pay by department, attrition vs satisfaction, a visible gender pay gap | 6 duplicates, 46 missing survey scores |
| Student Performance | 620 | Attendance and study hours drive marks | 42 missing attendance / marks |
| Customer Churn | 911 | Month-to-month churns hardest, spend by plan | 9 duplicates, 127 missing NPS/logins, 2 blank rows |

---

## Testing

**Unit (253)** — `npm test`. Covers number/date/boolean parsing, type detection (including
the stratified-sampling case and identifier columns), statistics, outlier fences, quality
scoring, every cleaning action, filtering and cross-filtering, aggregation and bucketing,
histogram binning, chart suggestion, KPI evaluation, every insight rule, and formatting.
Includes a full-pipeline integration test that runs **the real bundled sample CSVs** through
parse → type → quality → clean → suggest → aggregate → KPI → insight and asserts that no
suggested chart comes back empty and no insight contains `NaN`/`undefined`.

**Browser e2e (50)** — `npm run probe`. Drives the **production build** in headless Chrome
over one continuous journey: load a sample, search, sort, clean, build a dashboard,
cross-filter by clicking a bar, change chart type, hide and restore a card, read the Story,
copy insights, build a custom chart, save, reopen, duplicate, delete, download a real CSV /
PDF / PNG and assert their magic bytes and size, switch theme and palette, change currency
and number format, use the keyboard shortcuts, build a dashboard for every sample dataset,
check each upload error message, verify zero horizontal overflow at 390 px — and finally
assert the whole journey produced **zero console errors**.

### Bugs the tests caught

Writing the tests was not a formality — these were real defects, each fixed and then locked
in with an assertion:

1. **`\d{2}|\d{4}` matched the wrong year.** `14/03/2024` parsed as 14 March **2020**,
   because the alternation tried two digits first. Silent and systematic.
2. **Stratified sampling used `floor`, not `ceil`.** With 1,500 rows the stride was 1, so
   detection only ever saw the first 1,000 — the exact case the sampling existed to catch.
3. **Coercion silently trimmed whitespace**, making the "Trim extra spaces" action, its
   quality finding and its score deduction all dead code.
4. **Cross-filtering re-bucketed with the column default**, so clicking "Q1 2024" on a
   quarterly chart filtered to January.
5. **The partial final period reported a 97 % collapse.** The headline insight on the
   flagship sample dataset was confidently false.
6. **Cost outranked Revenue** as the headline measure, titling a sales dashboard after its
   costs.
7. **Top-N excluded fully-unique columns**, so a 300-product list got no ranking chart.
8. **The slicers did not match the charts** — "Revenue by Region" was charted while Region
   could not be filtered, and a column nothing charted could be.
9. **Escape left dropdowns open**, and their full-screen invisible backdrop then swallowed
   every subsequent click on the page.
10. **KPI values were truncated** to `₹31…` because a fixed-width sparkline stole the room.
11. **80 px of horizontal overflow on mobile** from a `shrink-0` that stopped the header
    actions wrapping.
12. **PapaParse `worker: true` threw on every real upload.** Worker mode fetches a second
    copy of PapaParse from its own script URL, which does not exist in a bundled, hashed
    build — samples worked (different code path), so only the e2e probe caught it.

---

## Stack

SvelteKit 3 · Svelte 5 (runes) · TypeScript · Tailwind 4 · Apache ECharts 6 (tree-shaken,
dynamically imported) · PapaParse · SheetJS · pdf-lib · `@sveltejs/adapter-static`

No UI kit, no icon font, no chart wrapper library — the icon set, sparklines, health ring,
landing-page preview and dashboard thumbnails are all hand-written SVG.
