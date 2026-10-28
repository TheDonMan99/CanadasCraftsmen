# Changelog

## Phase 2: Catalog, settings and pricing (2026-10-28)

Built:

- **Database schema** (`supabase/migrations/`): every table in the spec's data
  model.
  - Row-level security is on for every table. The public can only read the
    enabled catalog and create orders and saved designs.
  - Database triggers write price history on every price edit.
  - Payments, status history and the audit log are append-only.
  - A font can't be switched on until its licence is confirmed.
  - Order numbers start at S-1001.
- **Setup:** `npm run db:setup` applies migrations and seeds the catalog,
  settings, fonts, inventory rows and the owner and production roles. It never
  overwrites your edits.
- **Local database:** `npm run db:local` runs a throwaway local Postgres for
  trying things without Supabase.
- **Settings pages:**
  - catalog editing for every category: on/off, bulk on/off, edit, reorder by
    drag or arrows, duplicate, add, price history, preview;
  - one form per settings group;
  - every change goes to the audit log.
- **Price calculator** (`lib/pricing`): size (preset, or custom width
  interpolated and rounded up to $5), style, backer, material, finish, colours,
  topcoat (forced to exterior for covered outdoor), add-ons, rush %, delivery,
  promo, $30 minimum, GST and rounding.
- **Endpoints:**
  - `GET /api/catalog`: enabled options only, with no internal notes or costs.
  - `POST /api/quote`: always recalculates on the server, ignoring any price
    sent in.
- **Lab:** the lab now reads the live catalog, so switching an option off
  removes it at once. A tick-box still shows options that are off, for test
  cuts.

Checked: 328 tests passing. In a browser against a local database:

- Switching Satisfy off removed it from the lab.
- Raising 36 in from $75 to $80 changed new quotes and recorded the change in
  price history.

Five hand-calculated orders match the calculator to the cent:

| Order | Total |
|---|---|
| Welcome sign | $75 |
| Family name on a maple backer | $150 |
| 33 in custom, outdoor, rush | $138 |
| Leaner with GST | $113 |
| 12 in with promo, minimum applied | $30 |

Decisions made while building:

- **Server database access** uses a direct Postgres connection
  (`DATABASE_URL`, the Supabase transaction pooler). Supabase's REST API isn't
  used for this. One SQL code path runs in production and in the tests. Sign-in
  and file storage will still use Supabase from phase 3.
- **Custom widths** outside the presets extend the price line from the nearest
  two presets that are on.
- **Raw wood** gets no topcoat unless the placement forces the exterior one.

Not connected yet: this cloud session can't reach Supabase. Once the
environment allows `*.supabase.co` and `*.pooler.supabase.com` and has
`DATABASE_URL` set, run `npm run db:setup`.

## Catalog update (2026-10-28)

- Two-tone signs are off for now: the "Layered two-tone" style and the
  "Two-tone" finish ship switched off (the engine and lab still support them).
- The $135 worked example is a guideline only and is not used as a pricing test
  in phase 2.

- Basic paint colours now cost $10 each (was $5); only White and Black are on.
  SPEC.md's paint table is updated to match. Metallic colours are unchanged.

## Phase 1: Engine and LightBurn files (2026-10-28)

Built:

- Next.js (App Router) + TypeScript + Tailwind project, Vitest test suite.
- The 14 fonts from the Google Fonts repository, each with its licence file:
  - 11 are on and the three thin fonts are off.
  - Variable fonts are pinned to the named weight, e.g. Dancing Script Bold = 700.
- `config/catalog.seed.json`:
  - every catalog table in the spec, as 94 options;
  - prices in cents and lengths in inches.
- `config/settings.seed.json`: machine, engine, sizes, export, nesting,
  production, payments, pricing and tax defaults.
- The engine in `lib/engine` runs the full pipeline:
  - lay out → scale → connect (weld, tighten, baseline bar, bridges, lines joined, fail)
  - → floating bits (bridge / merge / remove)
  - → style pieces → extras (keyholes, engraved small line) → kerf → clean up → check and report.
- All four construction styles, six backer shapes, and the vertical porch-leaner
  layout (spine bar for block fonts, vertical overlap for scripts, family name
  line, base foot).
- Strength checks:
  - piece-count rules per style;
  - thinnest section with location, using a morphological shrink test;
  - thin spots highlighted in red;
  - minimum letter heights, character limits, missing characters, font line
    rules, largest-sign limits.
- Exports:
  - LightBurn SVG in inches, using the LightBurn palette layers;
  - customer preview SVG and server-rendered PNG;
  - DXF of the cut layer;
  - 10 in calibration square;
  - spec file names.
- `/admin/lab`: the engine test bench, with the engine in a Web Worker for the
  live preview and server-rendered downloads.

Tests: 299 passing.

- 242 cases from the spec's test-name matrix: 174 pass and 68 fail with an
  expected message.
- The expected failures fall into three groups:
  - Oswald is a small-line-only font.
  - Letters fall below the minimum height for long names at 24 in.
  - Thin sections, mostly the hairlines of Playfair Display Bold and Abril
    Fatface.

Decisions made while building (all are editable settings):

- **Joint strength:** a weld only counts when the contact between letters is at
  least 1.5 × the material's minimum feature width long. Tightening therefore
  stops at a strong joint, not a hair-thin touch.
- **Floating bits:** a component smaller than half its letter's main stroke is a
  floating bit.
- **Short tapered tails:** tails under 0.5 in long
  (`thin_tail_ignore_len_in`) are not flagged as thin. Thin necks that join
  material are always flagged.
- **Engine-made bridges:** these are checked at their own set width (0.15 in
  dots and stencil bridges) rather than the material minimum. A warning says
  when they are narrower than the minimum.
- **Engraved small line:** it needs a backer or stencil panel to sit on; on a
  one-piece or layered word it is refused with a message.
- **Settings added beyond the spec:**
  - top line at 0.6 × and small line at 0.3 × the main letter height;
  - 0.4 in letter gap on block-font leaners;
  - 1.5 in maximum bridge length;
  - arch rise 15% of the width;
  - 5.5 in plank boards;
  - laser-time speeds (cut 20, score 60, engrave 400 in/min) until you enter yours.

Open items for later phases:

- Playfair Display Bold and Abril Fatface fail thin checks at most sizes. Consider
  giving them an auto-thicken value or switching them off after a test cut.

Next: phase 2, catalog, settings and pricing.
