# Welcome Sign Generator

A web app for designing, ordering and producing laser-cut welcome signs. Customers
design a sign; you confirm payment; one click makes a LightBurn-ready SVG.
`SPEC.md` is the full build spec and the source of truth.

**Status:** phases 1–2 of 6 (engine and LightBurn files; catalog, settings and pricing). See `CHANGELOG.md`.

## Run it on your computer

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:3000/admin/lab> for the engine lab.

In the lab you can:

- type text and switch fonts, styles, sizes, materials and engine settings;
- see the live preview and the checks report;
- download the SVG, PNG and DXF files;
- download the 10 in calibration square.

The lab has no sign-in yet. Owner sign-in for everything under `/admin` arrives
in phase 4, so for now run it on your own computer only.

## Connect the database (Supabase)

1. Copy `.env.example` to `.env.local`.
2. Fill in `DATABASE_URL` from Supabase → Project Settings → Database →
   Connection string, using the **Transaction pooler** (port 6543). Fill in the
   other three values from Project Settings → API. `SUPABASE_URL` is the bare
   project address, `https://<project>.supabase.co`, without `/rest/v1/`.
3. Create the tables and load the starting catalog:

   ```bash
   npm run db:setup
   ```

   It's safe to run again: migrations already applied are skipped, and catalog
   rows you've edited are never overwritten.

   If your computer can't reach the database (for example a sandbox that only
   allows HTTPS), paste `supabase/setup.sql` into Supabase → SQL Editor and
   click **Run** instead. It does exactly the same thing and is just as safe to
   re-run. After changing a migration or a seed file, regenerate it with
   `npm run db:sql` (a test fails if you forget).
4. Run `npm run dev` and open <http://localhost:3000/admin/settings/catalog>.

Without `DATABASE_URL` the app reads the seed files in `config/`, and the
settings pages are read-only.

To try the settings pages without Supabase, start a throwaway local database
(it keeps its data in `.local-db/`):

```bash
npm run db:local
```

Then, in a second terminal:

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run dev
```

## Settings and catalog

- `/admin/settings/catalog`: every option in every category.
  - Switch options on or off, one at a time or several at once.
  - Edit labels, prices and details, drag to reorder, duplicate, or add new
    options.
  - Each option has its price history and a preview.
- `/admin/settings/pricing`, `machine`, `engine`, `export`, `nesting`,
  `production`, `payments`, `tax`, `business`, `sizes`: one page per settings
  group.
- Every change is recorded in the audit log.
- Price changes apply to new quotes only.

## Test

```bash
npm test
```

This runs about 330 Vitest tests in about a minute. They cover:

- every engine pipeline step and the exports;
- the seed catalog;
- every spec test name in every enabled font at 24 and 36 in;
- the price calculator, including five hand-calculated orders;
- the database (schema, seed, edits, price history, append-only payments),
  against PGlite, a real Postgres that runs inside the tests.

- Each test name must either pass or fail with the outcome recorded in
  `tests/engine/expected-outcomes.json`.
- After an intended change to the engine or catalog, re-record that file, then
  read the diff before committing:

  ```bash
  npx tsx scripts/update-expected-outcomes.ts
  ```

Type checking:

```bash
npm run typecheck
```

## Before the first customer cut (on the laser)

1. Download the calibration square from the lab and import it into LightBurn. It
   must measure exactly 10.000 in. If it doesn't, stop and fix the export first.
2. In LightBurn:
   - Save cut, score and engrave settings per material, named exactly as in the
     app (for example "Birch plywood 1/4 in").
   - Turn on "Cut inner shapes first".
   - Set the green layer to not output.
3. Measure kerf for each material:
   - Cut a 2 in square and measure it with calipers.
   - Kerf = 2 in − measured width.
   - Until phase 2 adds the settings pages, enter it as `kerf_in` on the
     material in `config/catalog.seed.json`.
4. Cut the 36 in "Welcome" test preset in Pacifico on 1/4 in birch. It should
   come off in one piece and measure within 1/32 in of 36 in.

## Where things live

| Path | What |
|---|---|
| `lib/engine/` | The cut-file engine: pure functions shared by browser and server |
| `lib/export/` | LightBurn SVG, preview SVG, PNG, DXF, file names |
| `config/catalog.seed.json` | Every catalog option (products, styles, sizes, materials, colours, fonts…) |
| `config/settings.seed.json` | Machine, engine, export, nesting, production, payment and tax settings |
| `public/fonts/` | The 14 fonts, each with its licence file (`scripts/prepare_fonts.py` re-downloads them) |
| `app/admin/lab/` | The engine lab |
| `app/api/lab/` | Server-side file downloads for the lab |
| `lib/pricing/` | The price calculator (pure; the server always recalculates) |
| `lib/db/` | Database access: catalog, settings, seed, migrations |
| `supabase/migrations/` | The database schema |
| `app/admin/settings/` | Settings pages |
| `app/api/catalog`, `app/api/quote` | Public catalog and quote endpoints |
| `tests/` | Vitest suite |

## Deploy and back up

Deployment to Vercel arrives in phase 3; this section will cover it then.

Supabase backs up the database daily on paid plans. On the free plan, export
the database from the Supabase dashboard yourself (Database → Backups), or use
the nightly CSV email that arrives with orders in phase 6.
