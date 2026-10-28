# Welcome Sign Generator

A web app for designing, ordering and producing laser-cut welcome signs. Customers
design a sign; you confirm payment; one click makes a LightBurn-ready SVG.
`SPEC.md` is the full build spec and the source of truth.

**Status:** phase 1 of 6 (engine and LightBurn files). See `CHANGELOG.md`.

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

## Test

```bash
npm test
```

This runs about 300 Vitest tests in about a minute. They cover every engine
pipeline step, the exports, the seed catalog, and every spec test name in every
enabled font at 24 and 36 in.

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
| `tests/engine/` | Vitest suite |

## Deploy and back up

Deployment (Vercel) and backups (Supabase) arrive in phases 2 and 3; this
section will cover them then. For now the only thing to back up is this git
repository.
