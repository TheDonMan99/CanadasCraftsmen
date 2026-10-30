# Welcome Sign Generator

A web app for designing, ordering and producing laser-cut welcome signs. Customers
design a sign; you confirm payment; one click makes a LightBurn-ready SVG.
`SPEC.md` is the full build spec and the source of truth.

**Status:** all six phases built. Online card payments (Stripe) are deferred: customers pay by e-Transfer or cash and you mark orders paid. See `CHANGELOG.md`, and the checklist at the end of this file for what to test yourself.

## Run it on your computer

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:3000> for the public site and order form, and
<http://localhost:3000/admin> for the dashboard. On your own computer, the
sign-in page also has a **Dev sign-in** box: type an invited email (the owner,
`donovanarntson@gmail.com`, is invited from the start) and you're in, without an
email link. Dev sign-in is never available on Vercel.

In the lab you can:

- type text and switch fonts, styles, sizes, materials and engine settings;
- see the live preview and the checks report;
- download the SVG, PNG and DXF files;
- download the 10 in calibration square.

The lab is at <http://localhost:3000/admin/lab>.

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

## Orders (phase 3)

Customers design their sign at `/design`, step by step, with the live preview
and price above every step:

product → text → fonts → size → style and material → finish and colours →
placement and extras → proof → details.

- **Proof:** the order can't be placed until the customer ticks that the
  spelling, layout and refund policy are right.
- **Share link:** saves the design and gives a link to send to someone else. The
  link opens the design at the proof step.
- **On the server**, `POST /api/orders`:
  - checks the design against the live catalog;
  - recalculates the price, ignoring any price the browser sends;
  - runs the engine;
  - checks the needed-by date against the lead time and capacity;
  - saves the order (S-1001, S-1002, …) with a snapshot of the design and price;
  - stores the SVG, PNG and DXF in Supabase Storage (private bucket
    `order-files`);
  - sends the emails. Every send is recorded in `email_log`.
- **Emails** go through Resend:
  - The new-order alert to you has the preview in the body and the LightBurn
    SVG attached.
  - The customer's "order received" email is held until you set a from address
    on your own verified domain in Settings → Emails. Until then, alerts to you
    come from Resend's test address.
- **Spam protection:**
  - a hidden honeypot field;
  - 5 orders per device per hour;
  - Cloudflare Turnstile, when `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`
    are set.
- **Confirmation page:** `/order/S-1001/confirmation` only opens with the
  secret token in the link the customer gets. Order numbers alone can't be
  guessed into someone else's order.

Settings → Emails edits every template's on/off switch, subject and wording.
Settings → Spam protection and Settings → Production (lead times, capacity,
pause switch, share links) control the rest.

## Dashboard (phase 4)

Everything under `/admin` needs sign-in.

- **Sign-in** is by a link emailed to invited people (Settings → Users and
  roles). The owner role has every permission. The production role sees:
  - the board, order specs and the customer's first name;
  - previews and cut files.
  It never receives prices, payments or contact details from the server.
- **Home:** cards for new orders, unpaid balance, due this week, in production
  and revenue this month, then the production queue sorted by needed-by date.
- **Orders:**
  - the list has filters, search, bulk status change and bulk file generation;
  - opening a new order moves it to Awaiting payment.
- **Payment panel** on every order:
  - record payments and refunds (amount, method, date, reference, note);
  - **Mark as paid** records the full balance in one tap;
  - **Send reminder**; days unpaid show in red after 3;
  - payment statuses change by themselves;
  - payments and history can't be edited or deleted.
- **Cancelling** asks who cancelled and records the refund owed under the policy
  as a refund entry.
- **Cut-file gate:** SVG and DXF downloads need full payment. The owner can
  override with a reason, which goes into the order history. Settings →
  Production → "require full payment for cut files" off makes it a warning
  only.
- **Edit design:**
  - fix a typo or change a font; the customer-approved version stays on
    record;
  - you can email an edited proof for the customer to approve at
    `/proof/<link>`;
  - you choose whether the price changes.
- **Production board** (`/admin/board`): drag cards from Paid → In production →
  Ready → Complete, or tap the button on a phone. In production and Ready email
  the customer when those emails are on.
- **Enter an order** (`/admin/orders/new`): the same designer, marked with a
  source (Facebook Marketplace by default), with or without the customer's
  confirmation email.
- **Quick quote** (`/admin/quote`): build a design in under a minute. Then:
  - copy the price message;
  - save a square preview image for Messenger;
  - make a short link like `/d/7KQ2`, which shows the sign when pasted into
    Messenger;
  - make listing images for every size.
- **Replies** (`/admin/templates`): Messenger replies with copy buttons. They fill
  in your price list, design link, payment email and pickup note.
- **Customers:** contact details, order history, total spent, repeat-customer
  flag.

### Sign-in setup (Supabase, once)

In Supabase → Authentication → URL Configuration:

1. Set **Site URL** to your live address.
2. Under **Redirect URLs**, add `https://<your site>/auth/callback` and
   `http://localhost:3000/auth/callback`.

Supabase's built-in email sender only sends a few sign-in emails an hour. Once
your domain is verified in Resend, you can send sign-in emails through Resend
instead: Supabase → Authentication → Emails → SMTP settings, using Resend's SMTP
details.

## Nesting and inventory (phase 5)

- **Nesting** (`/admin/nesting`):
  1. Pick a material, then tick paid orders, or use **Plan next batch**: by
     needed-by date, rush first, as many as fit on one new sheet. From the orders
     list you can also select orders and use **Send to nesting**.
  2. **Nest** packs every part onto offcuts first, then spare panels, then new
     4 × 8 ft sheets ripped into Panel A and Panel B. Parts of one order stay on
     one panel when they fit. Plywood is grain-locked (no quarter turns).
- **Reviewing a job:**
  - each panel is drawn with every part labelled by order;
  - drag a part to adjust it (it snaps to 1/8 in), then **Save layout**; the
    server checks it's inside the panel and 1/4 in from the others;
  - or **Re-run**.
- **Files for a job:**
  - **Download SVG** gives one LightBurn file per panel, at true size (48 ×
    47.875 in), with the panel outline and order numbers on the green labels
    layer;
  - **Cut list** is a printable list of panel, order, part, size and finish.
- **Mark as cut:**
  - inventory drops by the sheets used, and an unused Panel B becomes a spare
    panel;
  - used offcuts are closed, and leftovers of at least 6 × 12 in are saved as
    offcuts;
  - the orders move to In production.
- **Material cost** per order (sheet cost ÷ sheet area × the area its parts
  take up, spacing included) is shown to the owner on each job.
- **Inventory** (`/admin/inventory`):
  - full sheets, spare panels and offcuts per material;
  - **Add stock**, where the cost per sheet you enter becomes the material's
    sheet cost;
  - correct counts, set the low-stock alert, and add or remove offcuts.
  - Low stock shows on the home screen.


- `/admin/settings/catalog`: every option in every category.
  - Switch options on or off, one at a time or several at once.
  - Edit labels, prices and details, drag to reorder, duplicate, or add new
    options.
  - Each option has its price history and a preview.
- `/admin/settings/pricing`, `machine`, `engine`, `export`, `nesting`,
  `production`, `payments`, `tax`, `business`, `sizes`, `emails`, `spam`: one
  page per settings group.
- `/admin/settings/users`: invite people, pick their role, and switch each
  role's permissions on or off.
- Every change is recorded in the audit log.
- Price changes apply to new quotes only.

## Reports and scheduled emails (phase 6)

- **Reports** (`/admin/reports`), over the last 3, 6, 12 or 24 months:
  - money received and sales by month;
  - sales by product, size, finish and order source;
  - average order value;
  - unpaid balances aged 0–7, 8–14 and 15+ days;
  - material cost and gross margin per order. Material comes from cut nest
    jobs, or is estimated until cut. Labour is added once you set an hourly
    rate in Settings → Pricing.
- **GST tracker:** money received over the last four calendar quarters. It warns
  at $25,000 and tells you to register at $30,000, in one quarter or over four.
- **CSV export** of orders and of payments.
- **Scheduled emails** (Settings → Emails switches each one on or off):
  - **daily digest** at 7:00 am Mountain: new orders, unpaid orders with days
    waiting, orders due this week, low stock;
  - **weekly summary** on Mondays at 7:00 am: money received, orders, unpaid
    balance, materials used;
  - **review request** to the customer 3 days after an order is Complete (off
    until you switch it on and set a review link in Settings → Business);
  - **nightly CSV backup** of every order and payment (off by default).
  - Vercel Cron calls `/api/cron/daily` at 13:00 and 14:00 UTC (see
    `vercel.json`). Only the call that lands at 7 am Mountain does anything, so
    daylight saving never moves it. It needs `CRON_SECRET` set in Vercel.
  - The **Email me now** buttons on the reports page send any of them straight
    away, to try them.
- **True-shape nesting:** Settings → Nesting → method.
  - `best` (the default) tries rectangle packing and true-shape packing and
    keeps whichever needs fewer panels.
  - True-shape lets small signs sit in the empty space of bigger ones, still
    1/4 in apart.
  - `rectangle` and `true_shape` force one or the other.

## Test

```bash
npm test
```

This runs about 520 Vitest tests in about two and a half minutes. They cover:

- every engine pipeline step and the exports;
- the seed catalog;
- every spec test name in every enabled font at 24 and 36 in;
- the price calculator, including five hand-calculated orders;
- the database (schema, seed, edits, price history, append-only payments),
  against PGlite, a real Postgres that runs inside the tests;
- the order form's design rules and the whole order submission: price
  tampering, spam checks, lead times, files and emails;
- nesting: the packer, a real job from four paid orders, panel files at true
  size, marking as cut, and the next run using the saved offcut;
- true-shape nesting, including a part fitted into another's empty corner;
- reports against a hand tally, the GST tracker, CSV safety;
- scheduled emails: 7 am in summer and winter, once a day, Mondays only;
- the dashboard:
  - payment statuses and refunds under the policy;
  - the cut-file gate;
  - append-only payments;
  - that the production view leaks no prices or contact details;
  - edited proofs, users and roles.

The order flow in a real browser, at phone size (needs `npm run build` first):

```bash
npm run test:e2e
```

This test:

- starts its own throwaway database and the built app;
- designs and orders a sign;
- checks the confirmation page, a tampered price and a share link;
- signs in as the owner:
  - marks the order paid, and checks that cut files unlock;
  - stocks birch, nests the order onto Panel A, downloads the panel file, and
    marks it cut;
  - cancels a paid order for the customer (50% refund);
  - invites a production user, and uses quick quote;
- checks the reports page and the CSV exports;
- signs in as that production user, checks they see no prices or contact
  details (or reports), and moves the order on the board;
- saves screenshots to `test-output/e2e/`.

It never touches Supabase, Resend or Turnstile.

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
| `public/fonts/` | The 19 fonts, each with its licence file (`scripts/prepare_fonts.py` re-downloads them) |
| `app/admin/lab/` | The engine lab |
| `app/api/lab/` | Server-side file downloads for the lab |
| `lib/pricing/` | The price calculator (pure; the server always recalculates) |
| `lib/db/` | Database access: catalog, settings, seed, migrations |
| `supabase/migrations/` | The database schema |
| `app/admin/settings/` | Settings pages |
| `app/api/catalog`, `app/api/quote` | Public catalog and quote endpoints |
| `app/design/` | The public order form (designer) |
| `app/order/`, `app/privacy/` | Order confirmation and privacy pages |
| `app/api/orders`, `app/api/designs` | Order submission and share links |
| `lib/order/` | The order form's design model, dates and policy (pure) |
| `lib/server/submit-order.ts` | Everything that happens when an order is placed |
| `lib/email/` | Email templates |
| `supabase/setup.sql` | The whole schema and seed, to paste into the Supabase SQL Editor |
| `app/admin/` | Dashboard: home, orders, board, customers, quick quote, replies, lab, settings |
| `lib/auth/` | Sign-in and role permissions |
| `lib/db/admin.ts` | Dashboard reads and writes (payments, statuses, users, replies, short links) |
| `lib/order/payments.ts` | Statuses, payment and refund rules, the cut-file gate (pure) |
| `config/reply-templates.seed.json` | The starting Messenger replies |
| `lib/nesting/pack.ts` | The panel packer, layout checks and leftovers (pure) |
| `lib/server/nesting.ts` | Planning, adjusting and cutting nest jobs |
| `lib/export/panel.ts` | One LightBurn SVG per panel |
| `app/admin/nesting/`, `app/admin/inventory/` | Nesting and inventory pages |
| `lib/nesting/trueshape.ts` | True-shape nesting |
| `lib/reports/` | Report figures, digests and CSV (pure) |
| `lib/server/scheduled.ts`, `app/api/cron/daily/` | Scheduled emails |
| `app/admin/reports/` | Reports page |
| `docs/brand/` | The brand kit: guide, tokens, component styles, reference page |
| `app/globals.css`, `app/fonts/`, `public/brand/` | Brand styles, fonts and logos |
| `app/components/` | Customer-page header, footer and icons |
| `tests/` | Vitest suite |

## Deploy and back up

### Vercel

1. Import the GitHub repository in Vercel (Add New → Project). Vercel detects
   Next.js; keep the defaults.
2. Add the environment variables from `.env.example`. Use the **Transaction
   pooler** (port 6543) for `DATABASE_URL`.
3. Deploy. Every push to `main` deploys the live site; pushes to other branches
   get preview links.
4. Set `SITE_URL` to the live address, so links in emails point to it.
5. Set `CRON_SECRET` to any long random string. It turns on the daily digest and
   weekly summary; Vercel sends it with each scheduled call.

### Database changes

When a release adds a migration (a new file in `supabase/migrations/`), apply it
in one of two ways:

- run `npm run db:setup` from a computer that can reach the database; or
- paste `supabase/setup.sql` into Supabase → SQL Editor and click **Run**.

Either way is safe to repeat.

### Email from your own domain

1. In Resend → Domains, add your domain and add the DNS records it shows.
2. Once Resend shows the domain as verified, set **from address** in Settings →
   Emails, for example `orders@yourdomain.ca`.

Customer emails start sending after step 2.

### Back up

Supabase backs up the database daily on paid plans. On the free plan, either:

- export it yourself from the Supabase dashboard (Database → Backups); or
- switch on the nightly CSV backup email (Settings → Emails → nightly backup).

Reports → Orders CSV and Payments CSV download everything at any time.

## Checklist for you

The automated tests cover the logic. These need you, the laser, your phone or
a live account.

**Setup, once**

- [ ] Vercel has every variable in `.env.example`, including `SITE_URL` and
  `CRON_SECRET`.
- [ ] Supabase → Authentication → URL Configuration has your Site URL and the
  `/auth/callback` redirect URLs.
- [ ] You can sign in at `/login` with donovanarntson@gmail.com.
- [ ] Settings → Business: business name, privacy note, review link.

**On the laser (phase 1)**

- [ ] The 10 in calibration square (Lab) imports into LightBurn at 10.000 in.
- [ ] A 36 in "Welcome" in Pacifico on 1/4 in birch cuts in one piece and
  measures within 1/32 in of 36 in.
- [ ] Layered, letters-on-backer and stencil test signs cut correctly.
- [ ] Kerf is measured and entered for each material (Catalog → Materials).
- [ ] The five new fonts (Grand Hotel, Damion, Leckerli One, Fredoka Bold,
  Chewy) test-cut cleanly.

**Catalog and prices (phase 2)**

- [ ] Switching an option off hides it from the order form.
- [ ] Editing a price changes new quotes only, and price history records it.

**Orders and emails (phase 3)**

- [ ] A test order from your phone arrives in Gmail, with the preview and the
  SVG attached.
- [ ] Once your domain is verified in Resend and set in Settings → Emails, the
  customer email shows the amount due, payment instructions and refund policy.
- [ ] Turnstile shows on the order form.

**Dashboard and payments (phase 4)**

- [ ] Mark a test order paid. It goes to Paid in full, and its cut files unlock.
- [ ] An invited production login sees the board and files, with no prices or
  contact details.
- [ ] A quick quote's image and short link look right pasted into Messenger.
- [ ] One real Marketplace order runs from New to Complete.

**Nesting (phase 5)**

- [ ] A panel file imports into LightBurn at true size (48 × 47.875 in), with
  order labels on the green layer.
- [ ] Mark as cut lowers inventory and saves an offcut, and the next small
  order lands on that offcut.

**Reports (phase 6)**

- [ ] Reports totals match your own tally of a month's e-Transfers and cash.
- [ ] The daily digest arrives at 7:00 am Mountain. Use "Email me now" to
  check it first.
