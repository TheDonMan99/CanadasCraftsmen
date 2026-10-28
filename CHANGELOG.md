# Changelog

## Phase 4: Dashboard, payments and production (2026-10-29)

Built:

- **Sign-in** by emailed link (Supabase Auth), for invited users only:
  - the users table, plus `ADMIN_EMAIL`;
  - the owner, donovanarntson@gmail.com, is seeded;
  - on your own computer there's also a one-click dev sign-in, which is never
    available on Vercel.
- **Roles and permissions:** every permission is a switch per role, in Settings
  → Users and roles, which is also where you invite and remove people.
  - The owner always has every permission.
  - Production gets the board, specs, files, nesting and inventory.
  - Every admin page, action and endpoint checks the user's permission.
  - Production's order pages and board are built from queries that never select
    prices, payments or contact details.
- **Home:** cards for new orders, unpaid balance, due this week, in production
  and revenue this month, and the production queue by needed-by date with paid
  status. Production users see the queue of paid work instead.
- **Orders list:** number, date, customer, product, width, material, finish,
  total, paid, balance, status and due date. It has filters, search, bulk status
  change and bulk file generation.
- **Order page:**
  - preview, specs and engine report;
  - files;
  - timeline, email log, customer, price as ordered;
  - private notes.
- **Payment panel:**
  - big paid badge;
  - record payments and refunds (amount, method, date, reference, note);
  - mark as paid in one tap;
  - send reminder; days unpaid show in red after 3;
  - balance owing.
  Payments and history are append-only.
- **Statuses:**
  - opening a new order moves it to Awaiting payment;
  - payments move it to Deposit paid (only with deposits on) and Paid in full;
  - you move it through In production, Ready and Complete.
- **Cancelling** asks who cancelled. It records the refund owed as a refund
  entry: 50% before cutting, nothing after, 100% when you cancel.
- **Cut-file gate:** SVG and DXF need full payment. The owner can override with
  a reason, which is saved to the history. A setting switches it to warn only.
- **Files:**
  - download the latest SVG, PNG or DXF;
  - regenerate a new version with today's material settings;
  - downloads build the file on the spot if storage isn't set up.
- **Edit design:**
  - the same designer, starting from the order;
  - the approved version is kept in the design history;
  - you can email an edited proof the customer approves at `/proof/<link>`,
    a link that works once;
  - you choose whether the price changes;
  - files are regenerated.
- **Customer status emails:**
  - payment received, plus an optional copy to you;
  - payment reminder;
  - edited proof;
  - in production;
  - ready.
- **Production board:** drag and drop, with buttons on phones.
- **Customers:** contact details, order history, total spent, repeat flag.
- **Entering orders yourself** (`/admin/orders/new`): the same designer, a source
  (Facebook Marketplace by default), no spam checks or lead-time limit, and the
  customer email optional.
- **Marketplace tools:**
  - **Quick quote:** a one-screen designer. It copies a price message, saves a
    square preview image, makes a short design link (`/d/7KQ2`), opens the
    design as an order, and makes listing images at every size.
  - Shared design links now show the sign as the link preview in Messenger.
  - **Reply templates** with copy buttons. Price list, design link, payment email
    and pickup note fill in automatically; the five starting replies are
    seeded.
- **5 more fonts**, picked from 11 Google Fonts candidates by running each
  through the engine on the spec's test names:

  | Font | Use | Spec test cases passing | Auto-thicken |
  |---|---|---|---|
  | Grand Hotel | Welcome, family names | 22/22 | 0.02 in |
  | Damion | Welcome, names | 21/22 | 0.02 in |
  | Leckerli One | Nursery names, welcome | 17/22 | 0.02 in |
  | Fredoka Bold | Nursery names, "Est." line | 21/22 | none |
  | Chewy | Nursery names, kids' rooms | 21/22 | none |

  Every miss is "letters too small" on long names at 24 in. Cookie, Norican,
  Courgette, Baloo 2, Sniglet and Lilita One were tried and left out.

  The fonts are on for every product. A migration adds them to the products in a
  database seeded before now.
- **Database:** migration `20261030000000_dashboard.sql` adds:
  - edited-proof links;
  - the cut-file override reason;
  - who cancelled;
  - indexes.
  `supabase/setup.sql` includes it, with the seeded owner account and reply
  templates.

Fixed along the way:

- Local databases (`npm run db:local` and the browser test) now use one
  connection, one query at a time. The PGlite socket server mixed up the
  parameter types of overlapping queries. Supabase connections are unchanged.
- Server-rendered PNGs now use the bundled Montserrat for their size label.
  Vercel has no system fonts, so the label would have been blank in email
  previews.
- Node scripts such as `scripts/update-expected-outcomes.ts` work again with
  opentype.js.

Tests: 503 Vitest tests passing (68 new, plus the 5 fonts across the test-name matrix), and the browser test passes. The browser test
now also checks:

- that `/admin` needs sign-in and an uninvited email can't sign in;
- that cut files are locked until Mark as paid releases them;
- a customer cancellation that records a $37.50 (50%) refund;
- inviting a production user, and a quick quote;
- that the production login sees no prices, payments, contact details or last
  name, can download cut files, can't open the orders list, and moves the order
  on the board.

Decisions made while building:

- **Opening a new order** moves it from New to Awaiting payment, so "New"
  means you haven't looked at it yet.
- **File names** follow the spec (`S-1042_Smith_36in_…`) for everyone. That puts
  the customer's last name in the file name production downloads, though
  nowhere else production sees.
- **Edits keep the price** unless you tick "change the price".
- **Sending selected orders to nesting** arrives with phase 5.

What you need to do:

- In Supabase → Authentication → URL Configuration, set:
  - Site URL: your live address;
  - Redirect URLs: `https://<site>/auth/callback` and
    `http://localhost:3000/auth/callback`.
- Run `supabase/setup.sql` again.

Checklist for you (spec phase 4):

- [ ] Full payment recorded on an order; statuses change on their own. Shown in
  tests.
- [ ] Cut files blocked until paid in full; an override saves its reason. Shown
  in tests.
- [ ] A customer cancellation before cutting records a 50% refund. Shown in
  tests.
- [ ] The production login sees the board, specs and files, but no prices,
  payments or contact details. Shown in tests.
- [ ] A quick quote's preview image and short link work when pasted into
  Messenger on your phone.
- [ ] One real Marketplace order run from New to Complete.

Next: phase 5, nesting, inventory and offcuts.

## Phase 3: Order designer, orders and emails (2026-10-28)

Built:

- **Order form** (`/design`): a phone-first, step-by-step designer.
  - Steps: product → text → fonts → size → style and material → finish and
    colours → placement and extras → proof → details.
  - The live preview and price sit above every step. The preview is drawn by
    the same engine that makes the cut file, in a Web Worker.
  - Only options that are on appear.
  - Each font is shown with the customer's own text.
  - Size presets show the height they'd give.
  - Thin spots show in red. When a sign can't be cut, the form offers the fix:
    a bigger size, another font, or letters on a backer.
  - The proof shows the big preview with its size, the text letter by letter,
    the price breakdown and the refund policy. A required box approves it.
  - Details: name, email, phone, pickup or delivery (address if needed),
    needed-by date (no earlier than the lead time allows), how they heard about
    you, notes and the privacy note.
- **Share links** (`POST /api/designs`, `/design/<id>`): save a design and send
  the link. It opens at the proof, ready to change or order.
- **Placing an order** (`POST /api/orders`):
  - checks the design against the live catalog and the product's rules;
  - recalculates the price (a price sent by the browser is ignored);
  - runs the engine and refuses designs that can't be cut;
  - checks the dates against lead time and capacity;
  - saves the order (S-1001 on) with snapshots of the design, labels, price
    breakdown and engine report, and records the proof approval time;
  - matches repeat customers by email.
- **Files:** each order's SVG, preview PNG and DXF go to a private Supabase
  Storage bucket (`order-files`) and are listed in `order_files`.
- **Emails** through Resend, each recorded in `email_log`:
  - **New-order alert to you:** subject like "New order S-1001 · Smith · 36 in ·
    $75 · UNPAID", the preview in the body and the LightBurn SVG attached.
  - **Order received, to the customer:** preview, amount due, payment
    instructions and refund policy.
  - Customer emails are held (and logged as held) until you set a from address
    on a verified domain. Until then, alerts to you come from Resend's test
    address.
  - A failed send never loses the order.
- **Spam protection:**
  - hidden honeypot field;
  - 5 orders per device per hour;
  - Cloudflare Turnstile, when its keys are set.
- **Confirmation page** (`/order/S-1001/confirmation`): amount due, payment
  instructions and the price breakdown. It only opens with the order's secret
  token, so order numbers can't be guessed into someone else's order.
- **Other pages:**
  - the landing page shows every product drawn by the engine, with "from"
    prices;
  - a privacy page.
- **Settings:**
  - new Emails page: from address, reply-to, alert address, and every template's
    on/off switch, subject and wording;
  - new Spam protection page;
  - production gains a share-link switch;
  - business gains the privacy note and the "how did you hear" list;
  - the settings editor now shows nested settings as fields and long text as a
    text box, instead of raw JSON.
- **Database:** migration `20261029000000_orders.sql` adds:
  - the order token;
  - a submission log for the rate limit;
  - email-log subject and error columns;
  - the storage bucket.
  `supabase/setup.sql` includes it.
- **Deploying:** fonts ship with every Vercel function. `SUPABASE_URL` works with
  or without `/rest/v1/` on the end. `.env.example` lists every key.

Tests: 367 Vitest tests passing (35 new), plus a Playwright order flow
(`npm run test:e2e`). The new Vitest tests cover:

- every product's starting design: valid, priced and cuttable;
- options switched off disappearing;
- dates and capacity;
- the whole order submission against a real Postgres:
  - a good order, with its snapshot, files and emails;
  - a tampered price;
  - an option that's switched off;
  - a design that can't be cut;
  - no proof approval;
  - a date too early, and the same order with rush;
  - escaping of customer text in emails;
  - the honeypot, Turnstile, the 6th order in an hour, and the pause switch;
  - failed email and storage.

The Playwright flow runs at iPhone size:

- designs a Lobster "Ava" nursery sign, 30 in, painted black, with keyholes;
- approves the proof and places order S-1001 for $90;
- checks the confirmation page and that a wrong token is refused;
- checks that a tampered $1 price saves at $75;
- checks that a share link opens at the proof.

Decisions made while building:

- **Capacity:** the earliest ready date moves back one week for each full week
  of capacity already taken by open orders. Rush orders use the 3-day rush lead
  time.
- **Starting fonts:** each product line can name its starting font. The "Est."
  line starts in Montserrat Bold, because Playfair Display's hairlines fail
  the thin check (the open item from phase 1).
- **Customer emails** wait for your own domain, as the spec says. This is a
  Settings → Emails switch (the from address), not a code change.
- **New orders** start as "New". Payment statuses follow in phase 4, when
  payments are recorded.
- **Landing page:** without product photos yet, it shows each product drawn by
  the engine, refreshed hourly.

Still to check (needs the live site):

- A test order on your phone arrives in Gmail with the preview and the SVG
  attached.
- The customer email shows the full amount due, payment instructions and refund
  policy. Shown in tests; on the live site it needs a verified domain first.
- A tampered price is ignored and recalculated. Passes in tests and in the
  browser test.

Next: phase 4, dashboard, payments and production.

## Connecting Supabase (2026-10-28)

- The Supabase keys work: the secret key reaches the project's API, and the
  publishable key reaches sign-in.
- This cloud session still can't open a Postgres connection, so `npm run
  db:setup` can't run here. Its network only passes HTTPS traffic:
  - the proxy opens a tunnel to the database port, then drops the Postgres
    traffic;
  - `api.supabase.com`, which could run SQL over HTTPS, is blocked.
  This only affects the sandbox. Vercel connects to Postgres normally.
- New: `supabase/setup.sql`, which you paste into the Supabase SQL Editor. It
  does exactly what `npm run db:setup` does: it is generated from the same
  migration and seed code, by `npm run db:sql`. It's safe to re-run, and
  `db:setup` skips work it has already done.
  Tests check that:
  - the script leaves the database identical to `db:setup`;
  - re-running it keeps your edits;
  - the committed file is up to date.
- `SUPABASE_URL` should be the bare `https://<project>.supabase.co`. The value
  set in this environment ends in `/rest/v1/`.

- After the first run of `setup.sql`, every table loaded, but the Supabase API
  was refused access to them. Newer Supabase projects don't give the API roles
  access to tables created in SQL. A new migration gives the server-side
  `service_role` key full access. The public `anon` key still gets none:
  customers go through the app's own endpoints, which recalculate prices and
  check for spam. The spec's "public can create orders" rule is met that way,
  rather than letting browsers write to the orders table directly.

Tests: 332 passing.

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
