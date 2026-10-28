# Welcome Sign Generator — Build Plan

Oct 27, 2026 · @Donovan

## Overview

Customers design and order a sign on a web page, the order is emailed to donovanarntson@gmail.com, you confirm payment in a private dashboard, and one click produces a LightBurn-ready SVG. Paid orders are then packed onto 4 × 4 ft panels cut from 4 × 8 ft sheets. The target is under two minutes from a paid order to a file open in LightBurn.

This document is the full build spec for Claude Code. Every option a customer can pick lives in an editable catalog: products, construction styles, sizes, materials, finishes, paint colours, stains, topcoats, fonts, add-ons, delivery and payment methods. Each option can be switched on or off and its values and prices changed from the dashboard, with no code changes. The values in this document are the starting defaults the app ships with.

The app has two halves:

- **Public order page:** a step-by-step designer with a live preview of the exact sign, live price, proof approval and contact details.
- **Private admin dashboard:** orders, payment confirmation, production board, cut-file generation, panel nesting, inventory, reports and all settings.

It sells premium welcome signs with laser-cut letters, family and nursery name signs, round door signs, vertical porch leaners and custom text. Most orders are expected through Facebook Marketplace, so quick quotes, design links and entering orders yourself are built in.

&#91;embedded content: order flow · 8 steps, 1 payment check\]

Unpaid orders loop through a one-click reminder; only orders you mark paid move on to a cut file, a sheet and the laser.

## Machine and material constraints

The laser is a LaserTree K40 diode module run from LightBurn. Its frame reaches about 5 × 5 ft, but the app uses 48 × 48 in so every 4 × 8 ft sheet rips cleanly into two 4 × 4 ft panels. The largest sign the app allows is 46 × 46 in.

| Setting | Default | Notes |
| --- | --- | --- |
| Laser | LaserTree K40 diode module (about 40 W optical) | Narrow kerf; cut edges come out darker than a CO2 cut |
| Cut area used | 48 × 48 in | Machine reaches about 60 × 60 in; raise only if a future product needs it |
| Stock sheet | 48 × 96 in (4 × 8 ft) | Birch and maple plywood |
| Laser panel | 48 × 47.875 in | You rip each sheet into two panels, A and B, with a 1/8 in saw cut |
| Panel edge margin | 0.5 in | Clear space around the panel edge |
| Largest sign | 46 × 46 in | Panel minus margins, rounded down |
| Laser software | LightBurn | SVG import; stroke colours map to layers |
| Kerf | 0.008 in (0.2 mm) per material until measured | Diode kerf widens slightly on thicker material |
| Passes | 1 per material | Raise on a material if it doesn't cut through cleanly |
| Units | Inches in the app; SVG exported in inches | Millimetres shown beside small values |

All values live in Settings → Machine. Changing the cut area or sheet size recalculates the largest sign and the size presets that fit.

**Measuring kerf:** cut a 2 in square from each material at your normal settings and measure it with calipers. Kerf = 2 in − measured width. Enter it on that material; the engine offsets by half of it.

**Diode notes:** keep air assist on when cutting, and plan to sand or paint cut edges. Birch and maple plywood can need different speeds or passes, so run a test cut on each before the first customer order.

## Options catalog

Every choice a customer sees is a catalog row you control from Settings → Catalog. Turning an option off hides it from new orders immediately but keeps it on past orders, and editing a price never changes an order already placed.

**Fields on every catalog option**

- **Enabled** (on/off) and **Stock status** (in stock / out of stock; out of stock shows as unavailable or adds lead time, your choice per option)
- **Customer label** and optional short description
- **Price change:** none, flat ($), percent (%), or per inch of width
- **Sort order** (drag to reorder)
- **Applies to:** which products or construction styles can use it
- **Type-specific values:** preview colour, thickness, kerf, font file, and so on
- **Internal notes:** for example the exact paint or stain product you buy

Dashboard tools for the catalog: add, duplicate, bulk on/off, drag to reorder, preview how an option looks on a sample sign, and a price-change history.

**Products**

| Product | Default text lines | Default size | On |
| --- | --- | --- | --- |
| Welcome sign | "Welcome" + family name + optional "Est." line | 36 in wide | On |
| Family name sign | Family name + "Est. year" | 30 in wide | On |
| Nursery name sign | Child's name | 36 in wide | On |
| Porch leaner (vertical) | "WELCOME" or a word stacked top to bottom, optional family name across the bottom | 46 in tall | On |
| Round door sign | Name or "Welcome" on a circle backer | 18 in wide | On |
| Custom text | Up to 3 free lines | 24 in wide | On |

Each product sets its default lines, default width, and which construction styles, sizes and fonts are allowed.

**Construction styles**

| Style | What gets cut | Price change | On |
| --- | --- | --- | --- |
| One-piece word | Letters welded or bridged into one piece that hangs on its own | Base | On |
| Layered two-tone | One-piece word on top of a matching outline layer 0.25 in larger, in a second colour | +$30 | Off (for now) |
| Letters on backer | Letters cut separately and glued to a backer; the backer gets an engraved placement guide | +$40 | On |
| Stencil panel | Letters cut out of a solid panel, with bridges so letter centres stay in | +$20 | On |

**Backer shapes** (letters on backer, stencil panel and round door sign)

| Shape | Price change | On |
| --- | --- | --- |
| Rectangle | $0 | On |
| Rounded rectangle (1 in corners) | $0 | On |
| Plank look (engraved board lines) | +$10 | On |
| Arch top | +$5 | On |
| Oval | $0 | On |
| Circle | $0 | On |

Backer padding around the text defaults to 1.5 in on all sides (editable).

## Sizes

Customers pick the width; the height follows from the text, font and style. Every preset can be switched off or re-priced, and custom widths are priced between the two nearest presets.

| Width (in) | Typical use | Base price (CAD) | On |
| --- | --- | --- | --- |
| 12 | Shelf, desk, small door | $35 | On |
| 18 | Door, small wall | $45 | On |
| 24 | Entryway | $55 | On |
| 30 | Porch, mantel | $65 | On |
| 36 | Nursery wall, porch | $75 | On |
| 40 | Large wall | $85 | On |
| 44 | Statement piece | $95 | On |
| 46 | Largest a panel allows | $105 | Off |

**Custom width:** on by default, from 10 in to the largest-sign limit (46 in). Price is interpolated between the nearest presets and rounded up to the next $5.

**Size rules (editable in Settings → Sizes)**

- Height is calculated and shown live; if it exceeds 46 in the form asks for a smaller width or shorter text
- Minimum letter height: 2 in for the main name, 1.5 in for the top line, 1 in for a cut small line, 0.5 in for an engraved small line
- If the chosen width makes letters smaller than these minimums, the form suggests the next size up
- Maximum characters: 12 on the top line, 20 on the main name, 24 on the small line
- Every product can limit which sizes it offers (for example, round door sign: 12 and 18 in only)

**Porch leaner heights** (vertical layout; width follows from the letters)

| Height (in) | Base price (CAD) | On |
| --- | --- | --- |
| 36 | $65 | On |
| 42 | $75 | On |
| 46 | $85 | On |

A 46 in cap keeps leaners on one panel. A two-piece leaner joined by a back brace, for heights up to 90 in, can be added later as a separate product.

**Market check (October 2026)**

- [Kingwood Decor & Laser](https://www.kingwooddecor.ca/products/custom-name-laser-sign-home-decor) in Fort McMurray sells natural birch name signs from 8 to 42 in wide, starting at $19 for 8 in; its listing data prices 36 in at $159 and 42 in at $190
- [Laser Art MTL](https://www.laserartmtl.ca/products/custom-name-sign) sells unpainted 1/4 in plywood name signs from $27.27 at 10 in, up to 40 in, and treats custom orders as non-refundable
- [Custom Laser Works](https://www.customlaserworks.ca/products/prod_01KXR2D9J45CV2SJS3R531MWB3) in Calgary lists a wooden family name sign at $125

The starting prices put a painted 36 in sign at $90, well under the Alberta shops above. That suits Marketplace buyers and fast early reviews. Once the queue is regularly full, raising the 30–46 in prices by 15–25% would still leave you below those shops.

## Materials and sheets

You stock birch and maple plywood, so those two are on and everything else ships switched off. Thickness is assumed to be 1/4 in for both; kerf values are starting points until measured.

| Material | Thickness | Used for | Price change | Kerf (starting) | Min feature width | Sheet cost CAD | On |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Birch plywood | 1/4 in (6 mm) | Everything: one-piece words, leaners, backers, stencil panels | $0 | 0.008 in (0.2 mm) | 0.1875 in | $25 | On |
| Maple plywood | 1/4 in (6 mm) | Premium option, same uses as birch | +$10 | 0.008 in (0.2 mm) | 0.1875 in | $35 | On |
| Birch plywood | 1/8 in (3 mm) | Separate letters, layered top piece | $0 | 0.006 in (0.15 mm) | 0.125 in | Enter cost | Off |
| MDF, paint grade | 1/4 in (6 mm) | Painted words, indoor only | −$5 | 0.008 in (0.2 mm) | 0.25 in | Enter cost | Off |
| Birch plywood | 1/2 in (12 mm) | Heavy backers | +$25 | 0.012 in (0.3 mm) | 0.25 in | Enter cost | Off |

**Other fields per material**

- **Indoor only** (MDF = yes): hidden when the customer picks covered outdoor placement
- **Grain lock** (plywood = yes): parts only rotate 0° or 180° on a panel so grain runs the same way across a sign
- **Passes** (default 1) and **cut speed (in/min):** entered by you from your LightBurn library; used to estimate laser minutes per order
- **Allowed for:** which construction styles and pieces (letters, backer, top layer, panel) may use it
- **Inventory:** full sheets, cut panels and offcuts on hand (see Sheet nesting)
- **Internal notes:** for example, maple can blotch under stain, so note that a pre-stain conditioner is needed

Material cost per order = sheet cost ÷ usable sheet area × the area the order's parts take up, including spacing. At $25 a sheet, a 36 in birch sign uses only a few dollars of wood.

## Finishes and paint colours

The customer picks a finish type first, then colours for each piece. Two-colour finishes ask for a colour per piece (letters and backer, or top layer and outline layer).

**Finish types**

| Finish | What it means | Price change | On |
| --- | --- | --- | --- |
| Raw wood | Sanded, no colour | $0 | On |
| Stained | One stain colour | +$10 | On |
| Painted, one colour | One paint colour | +$15 | On |
| Two-tone | Two colours: paint + paint, or paint + stain | +$25 | Off (for now) |

**Paint colours** (preview colour is for the screen only; record your exact paint product in internal notes)

| Colour | Preview hex | Price change | On |
| --- | --- | --- | --- |
| White | #F5F5F2 | $10 | On |
| Cream | #EFE6D2 | $10 | Off |
| Black | #1E1E1E | $10 | On |
| Charcoal | #3A3D40 | $10 | Off |
| Navy | #1F2A44 | $10 | Off |
| Dusty blue | #7A93AC | $10 | Off |
| Sage green | #9CAF88 | $10 | Off |
| Forest green | #2F4A3A | $10 | Off |
| Blush pink | #E8C4C0 | $10 | Off |
| Terracotta | #C46A4A | $10 | Off |
| Gold metallic | #C9A44C | +$5 | Off |
| Silver metallic | #B9BCC0 | +$5 | Off |
| Copper metallic | #B87333 | +$5 | Off |
| Custom colour match | Customer types a name or code | +$15 | Off |

## Stains and topcoats

Stains use the same catalog fields as paint. Topcoats are tied to where the sign will hang: picking covered outdoor automatically adds the exterior topcoat and hides indoor-only materials.

**Stains** (preview colours approximate; record the exact product in internal notes)

| Stain | Preview hex | Price change | On |
| --- | --- | --- | --- |
| Natural (clear) | #D9B98C | $0 | Off |
| Golden oak | #B5803F | $0 | Off |
| Early American | #8A5A33 | $0 | Off |
| Provincial | #7A4E2D | $0 | Off |
| Special walnut | #6B4429 | $0 | Off |
| Dark walnut | #4B3020 | $0 | Off |
| Red mahogany | #6E2E22 | $0 | Off |
| Espresso | #2B1E16 | $0 | Off |
| Weathered grey | #8C8780 | $0 | Off |
| Whitewash | #E6DFD3 | $0 | Off |

**Placement** (asked on the form)

- Indoor
- Covered outdoor (porch, under an overhang)

Uncovered outdoor isn't offered by default, because interior plywood and MDF don't hold up in direct weather. It can be added as a placement option if you start using exterior-grade material.

**Topcoats**

| Topcoat | When it applies | Price change | On |
| --- | --- | --- | --- |
| None | Raw wood finish only | $0 | On |
| Matte clear | Indoor default | $0 | On |
| Satin clear | Indoor, customer choice | $0 | On |
| Exterior clear (spar urethane) | Added automatically for covered outdoor | +$15 | On |

## Fonts

The app ships with 14 fonts from Google Fonts, which are released under open licences that allow commercial use; the licence file is stored with each font. Thin fonts start switched off until a test cut proves they hold together.

| Font | Style | Best for | Allowed lines | Auto-thicken | On |
| --- | --- | --- | --- | --- | --- |
| Pacifico | Thick connected script | Welcome, names | Top, main | 0 in | On |
| Lobster | Thick connected script | Names | Top, main | 0 in | On |
| Kaushan Script | Brush script | Welcome | Top, main | 0 in | On |
| Yellowtail | Connected script | Names | Top, main | 0.02 in | On |
| Dancing Script Bold | Connected script | Nursery names | Top, main | 0.02 in | On |
| Satisfy | Connected script | Welcome | Top, main | 0.03 in | On |
| Great Vibes | Thin formal script | Formal, weddings | Top, main | 0.04 in | Off |
| Alex Brush | Thin script | Formal | Top, main | 0.04 in | Off |
| Playfair Display Bold | Serif | Family names, "Est." line | All | 0 in | On |
| Abril Fatface | Heavy serif | Bold names | Main | 0 in | On |
| Montserrat Bold | Sans serif | "Est." line, modern | All | 0 in | On |
| Bebas Neue | Condensed capitals | Modern, farmhouse | All | 0 in | On |
| Oswald | Condensed sans | Small line | Small | 0 in | On |
| Amatic SC Bold | Hand-drawn capitals | Farmhouse | Main, small | 0.03 in | Off |

**Font settings**

- **Auto-thicken:** grows every stroke outward by this amount before welding, so thin scripts survive cutting
- **Allowed lines:** scripts for the top line and main name; block fonts for any line
- **Weld behaviour:** connected scripts weld by overlap; block fonts use a baseline bar or bridges (see the engine)
- **Missing characters:** the form warns if a font lacks a character the customer typed, such as é or ë
- **Adding a font:** upload a TTF or OTF in the dashboard; it can't be switched on until you tick "commercial licence confirmed" and attach the licence

Fonts from free download sites are often personal-use only, which doesn't cover signs you sell.

## Add-ons, delivery, deposits and pricing

The price is built from catalog rows and recalculated on the server for every order, so the total a customer sees always matches what gets saved. Each order stores a snapshot of its full price breakdown.

**Add-ons**

| Add-on | Price | On |
| --- | --- | --- |
| Keyhole slots cut into the sign | $0 | On |
| Sawtooth or D-ring hanging hardware | $5 | On |
| Wall mounting kit (screws and spacers) | $8 | On |
| Engraved small line instead of cut ("Est. 2019") | $10 | On |
| Gift wrap | $5 | Off |
| Rush (ready in 3 days or less) | +25% of subtotal | On |

**Delivery and pickup**

| Method | What the customer sees | Price | On |
| --- | --- | --- | --- |
| Local pickup | "Local pickup, Sherwood Park area. We'll contact you to arrange a time." No address is shown anywhere in the app or emails | $0 | On |
| Local delivery | Sherwood Park and Edmonton | $15 | On |
| Shipping | Quoted by you | Quoted | Off |

All wording is editable in Settings → Business.

**Payment and refunds** (Settings → Payments)

- Full payment upfront: the amount due at ordering is set to 100% (lower it any time to take a deposit instead)
- Payment methods: Interac e-Transfer (on), cash (on), card through a Stripe payment link (off until phase 6)
- Payment email for e-Transfers is a setting, starting as donovanarntson@gmail.com; instructions ask the customer to put the order number in the message
- Refund policy: 50% back if the customer cancels before cutting starts, nothing after; both percentages are editable, and the policy is shown at the proof step and in the order-received email
- Cancelling an order in the dashboard asks who cancelled. Customer cancellations calculate the refund under the policy; cancellations by you default to a full refund. Either way the refund is recorded as a payment entry

**Tax**

- GST is off by default, with the rate preset to 5% (Alberta has no provincial sales tax)
- A small supplier doesn't have to register for GST until taxable sales pass $30,000 in a single calendar quarter or over four consecutive quarters, then must register within 29 days. For a sole proprietor, all of their taxable sales count toward that total, not just signs ([CRA memorandum 2-2](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/2-2/small-suppliers.html))
- The reports page tracks rolling four-quarter sales and warns at $25,000 (editable)

**Price formula**

1. Size: preset base price, or interpolated custom width rounded up to the next $5
2. Add: construction style + backer shape + material + finish type + colour premiums + topcoat + flat add-ons
3. Rush: subtotal × rush %
4. Add delivery; subtract any promo code (promo codes off by default; percent or flat)
5. Apply the minimum order price ($30)
6. Add GST if switched on
7. Round the total to the nearest $1

Customers see the breakdown line by line (switchable). Example: 36 in welcome sign, layered two-tone, 1/4 in birch, two-tone paint with gold metallic, matte clear, keyhole slots, pickup = $75 + $30 + $0 + $25 + $5 + $0 + $0 = $135. (Guideline only: two-tone is off for now and basic colours are $10, so this example is not a pricing test.)

## Order form (customer-facing)

A step-by-step designer, built phone-first because most customers will arrive from Facebook or Instagram on a phone. The live preview and price sit above every step, and only options switched on in the catalog appear.

**Steps**

1. **Product:** welcome sign, family name, nursery name, porch leaner, round door sign, custom text
2. **Text:** the product's lines prefilled ("Welcome", family name, "Est." year); character counters per line
3. **Font:** each allowed font shown rendering the customer's own text; one font per line
4. **Size:** width presets with the calculated height shown in inches, plus custom width; porch leaners pick a height instead
5. **Style and material:** construction style, backer shape if needed, material
6. **Finish and colours:** finish type, then a colour per piece from paint or stain swatches
7. **Placement and extras:** indoor or covered outdoor, add-ons, rush
8. **Proof:** large preview with dimensions, the text spelled out letter by letter, the refund policy, and a required checkbox confirming spelling, layout and policy
9. **Contact and delivery:** name, email, phone, pickup or delivery address, needed-by date, how they heard about you, notes
10. **Submit:** confirmation page with order number, the amount due and payment instructions

**Live preview**

- Drawn by the same engine that makes the cut file, in the chosen colours, with a width × height label
- Toggle between a plain background and a wall background
- One-piece status: if the design can't be cut as one piece at that size, the form offers the fix (bigger size, another font, or letters on backer)

**Validation**

- Character limits and minimum letter heights from the Sizes settings
- Warns about characters the chosen font doesn't have
- Needed-by date must be at least the current lead time away, unless rush is chosen
- Indoor-only materials are hidden for covered outdoor placement
- Price and design are re-checked on the server before saving

**Capacity and lead time** (Settings → Production)

- Standard lead time 7 days, rush 3 days
- Weekly capacity 5 orders (raise to 10 when you're ready); once full, the form shows the next available ready date
- Pause switch for holidays, with a custom message on the order page

**Extras**

- Save and share a design link (so a customer can send it to a spouse before ordering), on by default
- You can enter orders through the same form from the dashboard, marked with a source (Facebook Marketplace, Instagram, market booth, referral, repeat customer)
- Order numbers run S-1001, S-1002, and so on
- Short privacy note on the form explaining what's collected and why
- Spam protection: hidden honeypot field, 5 submissions per hour per device, and Cloudflare Turnstile

**Facebook Marketplace workflow** (the main sales channel)

- **Quick quote** in the dashboard: build a design in under a minute and get the price plus a preview image to paste into Messenger
- **Design link:** send a pre-filled design; the customer can tweak it, approve the proof and order from their phone
- **Short links** that read well in Messenger (for example yourdomain/d/7KQ2)
- **Reply templates:** saved Messenger replies with copy buttons (price list, how to order, payment instructions, arranging pickup, order ready), editable in Settings → Templates
- **Listing images:** square mockups of sample designs at each size, for Marketplace listings
- **Orders taken in Messenger** go in through the dashboard form, with the source set to Facebook Marketplace by default

## Email notifications

Every new order emails donovanarntson@gmail.com with the preview image and the cut-ready SVG attached, so you can review it from your phone. Each email type can be switched on or off, and its subject and wording edited in Settings → Emails.

| Email | To | Sent when | Includes | On |
| --- | --- | --- | --- | --- |
| New order alert | You | Order submitted | Full order details, price breakdown, preview PNG in the body, SVG attached, dashboard link | On |
| Order received | Customer | Order submitted | Summary, preview, order number, amount due, payment instructions, refund policy | On |
| Payment reminder | Customer | You click the button (suggested after 3 days unpaid) | Amount owing, payment instructions | On |
| Payment received | Customer | You record a payment | Amount, balance owing, receipt | On |
| Payment logged | You | You record a payment | Copy for your records | Off |
| Edited proof to approve | Customer | You edit an approved design | New preview and an approve link | On |
| In production | Customer | Status moves to In production | Expected ready date | Off |
| Ready | Customer | Status moves to Ready | Ready notice; you'll be in touch to arrange pickup or delivery (no address shown) | On |
| Review request | Customer | 3 days after Complete | Link to leave a review | Off |
| Daily digest | You | 7:00 am | Unpaid orders with days waiting, due this week, new orders | On |
| Weekly summary | You | Monday 7:00 am | Revenue, orders, unpaid balance, materials used | On |

**New order alert subject:** "New order S-1042 · Smith · 36 in · $135 · UNPAID"

**Template variables** available in every template: order number, customer name, product, text lines, font, size, style, material, finish and colours, total, deposit, balance, payment instructions, needed-by date, dashboard link, proof link.

**Sending setup**

- Sent through Resend from an address on your domain (for example orders@yourdomain), with reply-to set to donovanarntson@gmail.com so customer replies land in your Gmail
- Until you have a domain, alerts to you still send; customer emails wait for the domain to be verified
- Every send is logged on the order with its status; a failed send shows a banner on the dashboard and can be retried

## Admin dashboard and payment tracking

The dashboard answers three questions at a glance: what's owed, what's paid, and what to cut next. No order gets a cut file until it's paid in full, unless you override it and give a reason.

**Home screen**

- Cards: new orders, unpaid balance ($), due this week, in production, revenue this month
- Production queue sorted by needed-by date, with paid status on every row

**Order statuses**

1. New
2. Awaiting payment
3. Deposit paid
4. Paid in full
5. In production
6. Ready (pickup or delivery)
7. Complete
8. Cancelled (from any status, with a reason)

Payment-driven statuses (2–4) change automatically when payments are recorded; Deposit paid only appears if you switch deposits on. Production statuses (5–7) are set by you, from the order or by dragging cards on the production board.

**Payment panel on every order (the paid / unpaid confirmation)**

- Big status badge: Unpaid, Deposit paid, Paid in full, or Refunded
- Record payment: amount, method (e-Transfer, cash, card link, other), date received, reference number (e-Transfer confirmation), note
- Multiple payments per order (deposit, then balance); balance owing calculated automatically
- Record refunds the same way, as negative payments; cancelling an order works out the refund owed under the refund policy
- Mark-as-paid shortcut: one tap records the full balance as paid by the default method, today
- Days unpaid shown in red after 3 days, with a send-reminder button
- Every payment and status change is logged with date and time and can't be deleted, only reversed

**Cut-file gate** (Settings → Production)

- Default: cut files require Paid in full
- Override: a confirm box asking for a reason, saved to the order history
- Can be changed to warn-only or to require full payment

**Order detail page**

- Preview, full specs, price breakdown snapshot, engine report (pieces, minimum feature width, cut length, estimated laser minutes, material area)
- Files: SVG, PNG, DXF; regenerate after edits
- Edit design: fix a typo or change a font; the customer-approved version stays on record, and an edited-proof email can go out for re-approval
- Status timeline, emails sent, private notes, photos of the finished sign

**Other screens**

- **Orders list:** columns for number, date, customer, product, width, material, finish, total, paid, balance, status, due date; filters, search, bulk status change, bulk generate files, send selected to nesting
- **Production board:** columns per production status, drag to move
- **Nesting:** see Sheet nesting
- **Inventory:** sheets, panels and offcuts per material, with low-stock alert (default: fewer than 2 sheets)
- **Customers:** contact details, order history, total spent, repeat-customer flag
- **Reports:** revenue by month, product, size and finish; average order value; unpaid aging (0–7, 8–14, 15+ days); material cost and gross margin per order; order sources; rolling four-quarter sales for GST; CSV export of orders and payments
- **Settings:** catalog, pricing rules, machine, materials, production and capacity, payments, tax, emails, business details (name, pickup wording, payment email), users and roles, reply templates

**Logins and roles** (Settings → Users)

Sign-in is by emailed link, only for people you invite. Every action is logged with who did it.

| Permission | Owner (you) | Production |
| --- | --- | --- |
| Production board, move orders between In production, Ready and Complete | Yes | Yes |
| Order specs: number, customer first name, text, font, size, material, finish, needed-by date | Yes | Yes |
| Previews and cut files, nesting, mark panels as cut | Yes | Yes |
| Inventory: view and record sheets used | Yes | Yes |
| Prices, payments and balances | Yes | No |
| Customer contact details (full name, email, phone, address) | Yes | No |
| Cut-file override for unpaid orders | Yes | No |
| Reports, settings, catalog, users, emails | Yes | No |

The owner account is donovanarntson@gmail.com. Each permission is a switch per role, so a role can be adjusted or a new one added later without code changes.

## Cut-file engine

The engine turns a design into cut-ready geometry at true size, proves it will come off the laser in the expected number of pieces, and writes the files. It is one shared module of pure functions that runs in the browser for the live preview and on the server for the final files, so both always match.

**Pipeline**

1. **Lay out text:** convert each line to vector outlines from its font, apply per-font auto-thicken, stack the lines with line spacing, centre them.
2. **Scale:** scale the whole layout to the ordered width; heights follow.
3. **Connect into one piece** (one-piece word and layered styles), trying in order and stopping at the first that passes:
   1. Weld: union all letters of a line where they already overlap.
   2. Tighten: reduce letter spacing in small steps until neighbours overlap by the weld overlap, up to the maximum tighten.
   3. Baseline bar: add a bar through the bottom of the letters, trimmed to the first and last letter, then union.
   4. Bridges: add tabs between remaining separate pieces at their closest points.
   5. Lines joined: connect stacked lines with bridges or a shared bar.
   6. Fail: report which letters are loose and suggest letters on backer.
4. **Floating bits:** i and j dots, apostrophes and accents are bridged to the nearest stroke by default; per-order options to merge or remove.
5. **Style pieces:** layered adds an outline layer offset outward; letters on backer keeps letters separate and builds the backer shape plus an engraved placement guide; stencil subtracts letters from the panel and adds bridges inside closed letter centres.
6. **Extras:** keyhole slots on the thickest strokes near 25% and 75% of the width, checked for strength; engraved small line on its own layer.
7. **Kerf:** offset every outline outward by half the material's kerf (holes inward).
8. **Clean up:** remove duplicate and overlapping lines, close every path, simplify curves within tolerance.
9. **Check and report:** piece count, thinnest section and its location, width × height, cut path length, part area, estimated laser minutes.

**Vertical layout (porch leaners)**

- Letters stack top to bottom on one vertical centre line; the ordered height, minus gaps, sets the letter height
- Script fonts: letters overlap vertically by the weld overlap and are unioned into one piece
- Block fonts: a vertical spine bar (default 0.5 in wide) runs behind the letter centres from the top letter to the bottom one, then everything is unioned
- Optional family name across the bottom, horizontal, joined to the spine or bottom letter
- Flat base foot (on by default, 0.5 in tall, as wide as the widest letter) so the leaner stands level
- Same checks as horizontal signs: one piece, minimum feature width, minimum letter height (a 7-letter word at 46 in gives letters about 6 in tall)
- Keyhole slots off by default for leaners; one slot in the top letter is optional

**Engine settings** (Settings → Engine; per-font and per-material values override these)

| Setting | Default |
| --- | --- |
| Weld overlap | 0.02 in (0.5 mm) |
| Maximum tighten | 15% of the average letter width |
| Tighten step | 1% of the average letter width |
| Baseline bar thickness | 0.3 in |
| Bridge width | 0.25 in |
| Dot and apostrophe bridge width | 0.15 in |
| Stencil bridge width | 0.15 in, 2 per closed letter centre |
| Layered outline offset | 0.25 in, rounded corners |
| Line spacing | 0.15 × main-line letter height |
| Keyhole slot | 3/8 in head hole, 3/16 in slot, 1/2 in long |
| Placement guide on backer | Score line on letter outlines |
| Curve simplify tolerance | 0.002 in |
| Minimum feature width | Per material (see Materials) |

**Pass rules**

- One-piece word: exactly 1 piece; holes inside letters, like the centre of o, a or e, are waste and don't count
- Layered: 2 pieces (word and outline layer)
- Letters on backer: 1 backer plus 1 piece per letter, each listed
- Stencil: 1 panel piece; any letter centre that would fall out without a bridge is a failure
- Every section at or above the material's minimum feature width; thinner spots are highlighted in red on the preview

**Test names for the automated test suite:** Ava, Liam, Olivia, Zoë, O'Brien, Jojo, The Smith Family, Welcome + Est. 2019, a 20-character main name, an all-capitals block-font name, and vertical porch leaners reading "WELCOME" and "HOME" at 46 in. Each must pass in every enabled font at 24 and 36 in, or produce the expected failure message.

## LightBurn export

Files import into LightBurn at exact size with each kind of line already on its own layer, so the work in LightBurn is: import, pick the material, frame, cut. LightBurn assigns imported shapes to layers by stroke colour, so the app uses LightBurn's standard palette colours.

| App layer | Stroke colour | LightBurn layer | Used for | Output |
| --- | --- | --- | --- | --- |
| Cut | #FF0000 | 02 (red) | Every cut line | On |
| Score | #0000FF | 01 (blue) | Placement guide on backers, plank lines | On, low power |
| Engrave | #000000 | 00 (black) | Engraved small line, filled shapes | On, fill mode |
| Labels | #00E000 | 03 (green) | Order numbers, panel outline, material name | Off |

Colours are editable in Settings → Export.

**File rules**

- SVG width and height in inches, with the viewBox in inches (1 unit = 1 in), so LightBurn imports at true size
- Cut and score lines are strokes with no fill; engrave areas are filled shapes
- Every path closed; no duplicate or overlapping lines, which LightBurn would cut twice
- Optional DXF export of the cut layer (switch in Settings → Export)
- One file per order for single signs, one file per panel for nested sheets
- File names: `S-1042_Smith_36in_Birch-6mm.svg` for an order, `2026-11-03_Birch-6mm_Sheet1_PanelA.svg` for a panel

**One-time LightBurn setup**

- Save cut, score and engrave settings for each material in LightBurn's material library, named exactly as in the app (for example "Birch plywood 1/4 in"); the label layer prints the material name on every file
- Turn on "Cut inner shapes first" in LightBurn's optimization settings, so letter centres are cut before outside edges
- Set the green layer to not output and save it as your default

**Calibration test:** the app includes a downloadable 10 in square on the cut layer. It must import into LightBurn at exactly 10.000 in; if it doesn't, fix the export before cutting anything else.

## Sheet nesting

A 4 × 8 ft sheet doesn't fit the 4 × 4 ft bed, so the app plans each sheet as two panels, A and B, ripped on the saw first. You pick paid orders, and the app packs their parts onto offcuts first, then panels, then new sheets, and gives you one LightBurn file per panel.

**Workflow**

1. Filter paid orders by material and thickness (only one material per run) and select them, or click "Plan next batch" to pick orders by needed-by date.
2. The app places parts on matching offcuts that fit, then Panel A, Panel B, and further sheets as needed.
3. Review the layout on screen: panels used, material used (%), and which order each part belongs to. Drag a part to adjust, or re-run.
4. Download one SVG per panel, plus a printable cut list: panel, order numbers, part names, finishes.
5. After cutting, click "Mark as cut": inventory drops by the sheets used, every order moves to In production, and usable leftovers are saved as offcuts.

**Nesting settings** (Settings → Nesting)

| Setting | Default |
| --- | --- |
| Panel size | 48 × 47.875 in (from Machine settings) |
| Panel edge margin | 0.5 in |
| Spacing between parts | 0.25 in |
| Rotation | 0°, 90°, 180°, 270°; plywood grain lock limits to 0° and 180° |
| Packing method | Rectangle packing (first version); true-shape nesting later |
| Use offcuts first | On |
| Smallest offcut worth keeping | 6 × 12 in |
| Fill gaps with small parts | On (separate letters and small signs fill leftover space) |
| Time limit per run | 10 seconds |

**Rules**

- Parts of one order stay on the same panel when they fit, so a sign isn't split across panels
- Every part carries its order number on the label layer, plus a panel outline for positioning on the bed
- Material cost is split across the orders on a panel by the area each order uses
- Saved layouts can be re-downloaded to re-cut a broken part

**Inventory**

- Counts per material: full sheets, cut panels and offcuts (each offcut with its size)
- Add stock when you buy sheets; the cost entered updates that material's sheet cost
- Alert when stock drops below 2 sheets (editable per material)

## Data model

One catalog table holds every option type, so a new colour, font or add-on is a new row, never new code. Orders store a full snapshot of their design and price, so later catalog edits never change past orders.

| Table | Key fields | Notes |
| --- | --- | --- |
| settings | business details, machine, engine, nesting, production, payments, tax, export, email settings | One row of grouped JSON; edited from Settings |
| catalog\_options | id, category, label, description, enabled, stock\_status, sort\_order, price\_type, price\_value, applies\_to, values (JSON), internal\_notes | Categories: product, style, backer\_shape, size, material, finish\_type, paint, stain, topcoat, font, addon, delivery, payment\_method, placement |
| catalog\_price\_history | option\_id, old\_price, new\_price, changed\_at | Written automatically on price edits |
| fonts | option\_id, font\_file, licence\_file, licence\_confirmed, allowed\_lines, auto\_thicken\_in | Can't be enabled until licence\_confirmed is true |
| customers | id, name, email, phone, source, created\_at | Matched by email for repeat customers |
| orders | id, number, customer\_id, status, product, design (JSON), width\_in, height\_in, price\_breakdown (JSON), total, deposit\_required, placement, delivery\_method, delivery\_address, needed\_by, rush, source, created\_by, proof\_approved\_at, engine\_report (JSON), notes\_customer, notes\_internal, created\_at | design holds text lines, fonts, style, backer, material, finish, colours per piece, topcoat, add-ons |
| order\_files | order\_id, kind (svg, png, dxf), storage\_path, version, created\_at | Regenerated files get a new version |
| payments | id, order\_id, amount, kind (payment, refund), method, received\_at, reference, note, recorded\_at | Balance owing = total − sum of payments |
| status\_history | order\_id, from\_status, to\_status, changed\_at, note | Includes cut-file override reasons |
| email\_log | order\_id, template, recipient, sent\_at, status, provider\_message\_id | Shown on the order page |
| inventory | material\_option\_id, full\_sheets, cut\_panels, low\_stock\_alert | One row per material |
| offcuts | id, material\_option\_id, width\_in, height\_in, source\_panel, used\_at | Unused offcuts are offered first in nesting |
| nest\_jobs | id, material\_option\_id, status (planned, cut), panels (JSON: panel label, sheet number, placements with order id, part, x, y, rotation), utilization, created\_at, cut\_at | Files stored like order\_files |
| saved\_designs | share\_id, design (JSON), created\_at | Share links from the order form |
| audit\_log | actor, action, entity, entity\_id, before, after, at | Every admin change |
| users | id, email, role, invited\_at, last\_sign\_in\_at | You as owner, plus invited production users |
| roles | name, permissions (JSON of on/off switches) | Owner and Production seeded from the Logins and roles table |
| reply\_templates | id, title, body, sort\_order | Messenger replies with copy buttons |
| short\_links | code, target\_type (design or quote), target\_id, created\_at | Messenger-friendly links like /d/7KQ2 |

**Rules for Claude Code**

- All lengths stored in inches as decimals
- Money stored in cents as integers, in CAD
- Seed catalog\_options from a single `catalog.seed.json` built from the tables in this document
- Payments and status history are append-only; corrections are new rows

## Pages, routes and security

Public pages need no login; everything under /admin requires your sign-in link, and the server never trusts prices or files sent from the browser.

**Public pages**

| Route | Page |
| --- | --- |
| / | Landing page with product photos, how it works, and an order button |
| /design | Step-by-step designer |
| /design/\[shareId\] | Saved design opened from a share link |
| /order/\[number\]/confirmation | Order confirmation and payment instructions |
| /proof/\[token\] | Customer approves an edited proof |
| /privacy | Privacy note |
| /d/\[code\] | Short link that opens a saved design or a quote you sent |

**Admin pages**

| Route | Page |
| --- | --- |
| /admin | Home: cards and production queue |
| /admin/orders and /admin/orders/\[id\] | Orders list and order detail with the payment panel |
| /admin/orders/new | Enter an order yourself |
| /admin/board | Production board |
| /admin/nesting | Plan panels, review layouts, download files, mark as cut |
| /admin/inventory | Sheets, panels and offcuts |
| /admin/customers | Customer list and history |
| /admin/reports | Revenue, unpaid aging, margin, sources, GST tracker, CSV export |
| /admin/settings/\* | Catalog, pricing, machine, engine, nesting, production, payments, tax, export, emails, business, users and roles |
| /admin/lab | Engine test bench: type text, switch fonts and settings, download test files |
| /admin/quote | Quick quote: design, price and preview image for Messenger, plus a design link |
| /admin/templates | Messenger reply templates with copy buttons |

**Server endpoints**

- `GET /api/catalog`: enabled options only, for the designer
- `POST /api/quote`: recalculates price from a design
- `POST /api/orders`: validates design, recalculates price, runs the engine, saves the order, stores files, sends both emails
- `POST /api/designs`: saves a share link
- `POST /api/proof/[token]/approve`
- Admin endpoints for orders, payments, statuses, catalog, settings, nesting, inventory, reports and exports, all requiring sign-in
- Scheduled jobs: daily digest (7:00 am Mountain), weekly summary (Monday 7:00 am Mountain), nightly orders backup emailed as CSV (off by default)

**Security and privacy**

- Sign-in by email link for invited users only (you as owner, plus production users); every admin endpoint checks the signed-in user's role permissions, and production users never receive prices, payments or contact details from the server
- Database row-level security: the public can create orders and saved designs, never read other orders
- Files in private storage, served through short-lived signed links
- Customer text is escaped before it goes into any SVG or email
- Rate limits and Cloudflare Turnstile on public endpoints
- Secrets only in environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`, `NOTIFY_EMAIL`, `SITE_URL`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, later `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`

## Tech stack

A small hosted web app in TypeScript, with the cut-file engine as a shared module that runs in the browser for previews and on the server for final files.

| Part | Choice | Why |
| --- | --- | --- |
| Language | TypeScript | One language for engine, site and server; catches unit and type mistakes |
| App framework | Next.js (App Router) | Public designer, admin and server endpoints in one codebase |
| Text to outlines | opentype.js | Reads TTF/OTF files and returns vector outlines, in browser and server |
| Shape merging and offsets | Clipper2 (JavaScript port) or Paper.js | Union for welding, offsets for kerf, thicken and layered outlines |
| Nesting | Rectangle packing first; true-shape later | Reliable first version; upgrade only if it saves material |
| Database, login, file storage | Supabase | Postgres, emailed sign-in links, private file storage, row-level security |
| Email | Resend | Reliable delivery with attachments and a simple API |
| Spam protection | Cloudflare Turnstile | Free, invisible to most customers |
| Hosting and scheduled jobs | Vercel | Simple deploys, custom domain, scheduled jobs for digests |
| Styling | Tailwind CSS | Fast to build a clean, phone-friendly layout |
| Tests | Vitest (engine and pricing), Playwright (order flow) | Engine and price rules tested on every change |
| Payments (later) | Stripe payment links and webhooks | Marks orders paid automatically |

At a handful of orders a week, these services' free or entry tiers are usually enough; check current pricing when signing up. A custom domain for the business is optional but needed before customer emails go out from your own address.

## Build phases

Six phases built back to back in one run. At the end of each phase Claude Code runs the automated tests, fixes failures, commits and updates the changelog, then carries straight on. The checklists are for you: do the laser checks as soon as phase 1 lands, since everything else depends on the engine, and the rest once the build is finished.

**Phase 1: Engine and LightBurn files** (runs on your computer)

Project set up in Next.js with the engine module, the /admin/lab test bench, 14 fonts, engine settings, all four construction styles, the vertical porch-leaner layout, and SVG, PNG and DXF export.

- [ ] 10 in calibration square imports into LightBurn at 10.000 in
- [ ] Every test name passes or fails as expected in the automated tests
- [ ] A 36 in "Welcome" in Pacifico on 1/4 in birch cuts in one piece and measures within 1/32 in of 36 in
- [ ] Layered, letters-on-backer and stencil test signs cut correctly
- [ ] Kerf measured and entered for each material

**Phase 2: Catalog, settings and pricing**

Database, catalog seeded from this document, settings pages with on/off and editing for every option, price calculator with tests.

- [ ] Switching any option off removes it from the lab designer immediately
- [ ] Editing a price changes new quotes only; price history records it
- [ ] Five hand-calculated orders match the calculator to the cent

**Phase 3: Order designer, orders and emails** (deployed online)

Public step-by-step designer, order saving, file storage, new-order alert to you, order-received email to the customer, spam protection, share links.

- [ ] A test order on your phone arrives in Gmail with the preview and the SVG attached
- [ ] The customer email shows the full amount due, payment instructions and refund policy
- [ ] A tampered price sent from the browser is ignored and recalculated

**Phase 4: Dashboard, payments and production**

Owner and production logins, home screen, orders list and detail, payment panel with full payment and the refund policy, statuses, production board, cut-file gate, edited-proof approval, customer status emails, entering orders yourself, and the Marketplace tools: quick quote, short design links, reply templates and listing images.

- [ ] Full payment recorded on an order; statuses change on their own
- [ ] Cut files blocked until paid in full; an override saves its reason
- [ ] A customer cancellation before cutting records a 50% refund
- [ ] The production login sees the board, specs and files, but no prices, payments or contact details
- [ ] A quick quote's preview image and short link work when pasted into Messenger on your phone
- [ ] One real Marketplace order run from New to Complete

**Phase 5: Nesting, inventory and offcuts**

Panel planning for 4 × 8 ft sheets, panel files, cut list, mark as cut, inventory and offcuts.

- [ ] Four paid orders nest onto panels; files import into LightBurn at true size with order labels on the green layer
- [ ] Marking as cut lowers inventory and saves a usable offcut
- [ ] The next run places a fitting part on that offcut first

**Phase 6: Reports and extras**

Reports, GST tracker, daily digest and weekly summary, CSV export, Stripe payment links that mark orders paid, review emails, true-shape nesting.

- [ ] Report totals match a manual tally of the month's payments
- [ ] A Stripe test payment marks its order paid without a click from you

## Decisions made

Every question now has an answer or a default, so Claude Code can build all six phases without stopping. Two things still need checking before cutting for customers: your measured kerf, and that both sheet types are 1/4 in thick.

| Decision | Answer | Where to change it |
| --- | --- | --- |
| Laser | LaserTree K40 diode module, run from LightBurn | Settings → Machine, Export |
| Cut area and stock | 48 × 48 in used (machine reaches about 60 × 60 in); you rip 4 × 8 ft sheets into two 4 × 4 ft panels; largest sign 46 × 46 in | Settings → Machine |
| Materials | 1/4 in birch ($25 a sheet) and 1/4 in maple ($35 a sheet, +$10 to the customer) on; others off | Catalog → Materials |
| Kerf | 0.008 in (0.2 mm) until measured | Catalog → Materials |
| Default style | One-piece word | Catalog → Styles |
| Products | All six on, including vertical porch leaners | Catalog → Products |
| Decorative shapes | Not included for now | — |
| DIY kits | Not offered | — |
| Sizes | 12–44 in presets on, 46 in off, custom width on; leaners 36, 42 and 46 in tall | Catalog → Sizes |
| Colours, stains, fonts | 14 paints and 10 stains on; 11 fonts on, 3 thin fonts off until test-cut | Catalog |
| Prices | Starting tables kept after the market check; review once the queue is regularly full | Catalog, Settings → Pricing |
| Your hourly rate | Not set; margin shows materials only until you add one | Settings → Pricing |
| Payment | Full payment upfront; e-Transfer and cash; payment email editable, starting as donovanarntson@gmail.com; Stripe links in phase 6 | Settings → Payments |
| Refunds | 50% if the customer cancels before cutting starts; none after; full refund if you cancel | Settings → Payments |
| Unpaid orders | Cut files need full payment; owner override with a logged reason | Settings → Production |
| Capacity and lead time | 5 orders a week (raise to 10 later), 7 days standard, 3 days rush | Settings → Production |
| Pickup | No address shown anywhere; you arrange pickup directly | Settings → Business |
| Logins | Owner (you) plus a production-only role | Settings → Users |
| Main sales channel | Facebook Marketplace: quick quote, short design links, reply templates, listing images | Settings → Templates |
| GST | Off, rate preset to 5%, tracker warns at $25,000 | Settings → Tax |
| Business name and domain | "\[Business name\]" placeholder; runs on the free Vercel address until you pick one | Settings → Business |
| Build order | All six phases back to back in one run | — |

## Instructions for Claude Code

Export this doc as Markdown, save it as `SPEC.md` in an empty project folder, open Claude Code in that folder, and paste the build prompt. It builds all six phases in one run and only stops for accounts, keys or decisions it can't make. If a session ends mid-build, start a new one with the resume prompt.

**Working rules for Claude Code**

- `SPEC.md` is the source of truth; if code and spec disagree, ask before changing either
- Build phases in order; after each, run the tests, fix failures, commit, update `CHANGELOG.md`, then continue without waiting
- Never hard-code an option, price, colour or limit; everything comes from `catalog.seed.json` and settings
- Inches internally, money in cents; convert only for display and export
- The engine is pure functions in `/lib/engine`, with Vitest tests for every pipeline step and every test name
- Ask before signing up for any paid service or deleting data
- Keep a plain-English `README.md`: how to run, test, deploy and back up

**Build prompt**

```
Read SPEC.md in full. It is the build spec for a laser-cut sign ordering
and cut-file app. Build all six phases in order, back to back.

Before writing code:
1. Summarise the full scope in 15 bullets or fewer.
2. List every library, version and outside service you plan to use.
3. Show the folder structure and the database schema.
4. List the accounts and keys I need to create (Supabase, Resend, Vercel,
   Cloudflare Turnstile) with exact steps, so I can set them up while you
   build.
Wait for my OK once, then build without stopping between phases.

For each phase:
- Build exactly what the "Build phases" section lists for it
- Run the automated tests (Vitest for engine and pricing, Playwright for
  the order flow) and fix failures before moving on
- Commit with a message naming the phase and update CHANGELOG.md
- Only stop if you need an account, a key or a decision from me

Non-negotiables:
- Every option, price, colour and limit comes from catalog.seed.json and
  settings, never hard-coded
- The engine is pure functions in /lib/engine, shared by browser and server
- LightBurn export exactly as specified, including the 10 in calibration
  square
- Prices recalculated on the server; full payment required before cut files
- The production role never receives prices, payments or customer contact
  details from the server
- No pickup address appears anywhere in the app or emails

When all six phases are done, give me: how to run it locally, how to
deploy it, and a checklist of every acceptance test I need to do myself on
the laser and with a real order.
```

**Resume prompt**

```
Read SPEC.md and CHANGELOG.md. Continue the build from where CHANGELOG.md
says it stopped, following the same rules: test, commit and update the
changelog after each phase, and only stop for accounts, keys or decisions.
```
