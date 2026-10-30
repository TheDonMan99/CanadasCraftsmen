# Canada's Craftsmen brand guide

Read this before changing anything visual. Tokens are in `tokens.json` / `tokens.css` (Tailwind: `tailwind-theme.css`), component styles in `components.css` with usage notes in `components/`, logos in `logos/`, fonts in `fonts/`, and `reference.html` shows the components rendered. Token names in backticks below (`surface`, `ink`, `brand`…) are CSS variables in tokens.css (`var(--surface)`).

Canada's Craftsmen makes custom welcome signs and name signs, laser-cut from real birch and maple in Sherwood Park, Alberta. Customers design a sign on their phone, approve a proof, pay by e-Transfer or cash, and pick it up locally, usually within 7 days. Most of them find us on Facebook Marketplace.

The brand is built from the material: the pale birch face of the plywood, the dark scorched edge the laser leaves on every cut, and the red of the maple leaf. It should feel solid, warm and local, like a well-made sign on a front porch. It should never feel rustic-cute, farmhouse-scripty or like a craft-fair table.

## Voice and copy

- Write like a neighbour who makes things: plain, friendly, confident. Short sentences. Talk to the customer as "you"; the business is "we".
- Lead with what the customer gets, then how. "Welcome signs and name signs, cut from real wood." "Pick it up in Sherwood Park, usually within 7 days."
- Use sentence case everywhere: headlines, buttons, labels. The logo is the only thing set in capitals.
- Buttons say exactly what happens, verb first, and keep the same words through the flow: "Design your sign" opens the designer; "Approve proof" is answered by "Proof approved".
- Prices are "From $75", with no ".00" and no "only".
- Say "real wood", "birch" and "maple". Never "rustic", "farmhouse", "live laugh love", "handcrafted with love" or "artisanal".
- No emoji and no exclamation marks in site copy or listings. Confidence comes from the product photo, not punctuation.
- Errors say what happened and how to fix it: "That name is too long for a 24 in sign. Shorten it or choose 36 in."

## Logo

The logo is a sugar maple leaf with sharp, straight-cut points, rounded notches and a thick stem, beside the name set in Alfa Slab One. The leaf is drawn heavy so it holds its own next to the lettering. Files are in `logos/`. Every file is outlined, so no fonts are needed to open them.

| Use | File |
| --- | --- |
| Website header, documents, anything on paper or birch | `cc-logo-horizontal.svg` |
| On char or any dark photo | `cc-logo-horizontal-reversed.svg` |
| Square or tall spaces: packaging labels, posters, the footer | `cc-logo-stacked.svg`, `cc-logo-stacked-reversed.svg` |
| Very wide, short spaces (a sign-back strip, an email footer) | `cc-wordmark.svg`, `cc-wordmark-birch.svg` |
| One-colour printing | `cc-logo-horizontal-char.svg` |
| Facebook and Marketplace profile picture, app icon | `cc-avatar.png` (1080 px) |
| Browser tab | `cc-favicon.svg`, `cc-favicon.png` |
| Stickers, the back of every sign, the "seal" on a listing photo | `cc-stamp.svg`, `cc-stamp-reversed.svg`, `cc-stamp-on-birch.svg` |

- Keep clear space around the logo equal to the cap height of "CRAFTSMEN" on all sides.
- Minimum sizes: horizontal logo 140 px or 35 mm wide; stacked logo 120 px or 30 mm wide; stamp 64 px or 20 mm across (engrave it at 40–50 mm on sign backs); leaf mark alone 16 px.
- The leaf is maple on paper, birch or white, and maple-bright on char. In one-colour use it takes the same ink as the name.
- Don't recolour, stretch, outline, shadow or rotate the logo. Don't retype the name in another font. Don't put the leaf on a maple background (use `cc-avatar.png`, which reverses it). Don't bring back the old Canada map, and don't set the name twice in one lockup.

## Colour

- Build every page from `surface`, `ink` and one or two `band` sections. Use `birch` for photo mats and feature panels.
- Spend red on one thing per screen: the leaf, the primary button, or a link. `brand` is a spark, not a flood. The only large red field is the profile picture.
- Rough proportion: surface 60%, char and band 25%, birch 10%, maple 5%.
- Text on birch is `on-birch` (char) or kerf. Text on band is `on-band` (birch). Text on a brand fill is `on-brand`, never hard-coded white, because the dark theme lightens the fill.
- Never put maple on char (2.5:1). Use maple-bright for the leaf there, and `brand` for buttons, which the dark theme already lifts.
- Status always pairs colour with a word or icon. `success` is spruce, kept off the red-green axis; `danger` is a deeper red than `brand`, so it always comes with an icon and a fix.

## Type

- Set headlines and prices in Alfa Slab One (`display-xl` to `display-s`). It is a wood-type face, so it belongs to the brand the way the leaf does. Never set it below 24 px, never in paragraphs, and only in sentence case (the logo is the exception).
- Set everything else in Archivo: `body` for running text, `body-l` for intros, `title` for card and step titles, `label` for form labels, `button` for buttons, `small` for sizes and meta.
- Use `display-xl` once per page, for the hero. Under 600 px wide, step every display style down one size.
- Keep lines under 70 characters. Left-align text; centre only the stacked logo and short single-line captions under it.
- Don't letter-space text, and don't set labels in capitals.

## The burnt edge

Laser-cut birch has a dark caramelised edge, and that edge is the brand's signature detail. Draw it as an `edge-kerf` border in kerf around birch panels that hold a product photo or illustration, with `radius-md` corners. Use it on product photos, the order preview and the sign-back stamp. Never put it on buttons, text boxes or cards without a birch panel inside, or it stops meaning anything.

## Layout and surfaces

- Build pages in full-width bands: a char hero with the headline and one sign photo, paper sections for products and details, a char strip for how it works, a char footer with the stacked reversed logo.
- Side margins are `space-4` on phones and `space-12` on desktop. Sections are padded `space-16` on phones and `space-24` on desktop. Keep `space-8` between a headline and what it introduces.
- Product grids are one column on phones, two on tablets and three on desktop, gutters `space-6`.
- Corners: `radius-sm` for buttons and inputs, `radius-md` for birch panels, `radius-full` only for the stamp and profile pictures.
- Only product photos cast a shadow (`shadow-hang`, like a sign on a wall). Everything else is flat.
- Motion is minimal. Use one short fade when the sign preview updates. Nothing slides in on scroll. Respect reduced motion.
- Keyboard focus is a 2 px solid `focus` ring drawn 2 px outside the element, on every interactive element.

## Photography

- Show real signs in real places: on a porch, beside a front door, above a crib. Natural light, early morning or evening.
- Include close-ups of the burnt edge and the wood grain. They prove "real wood" better than any sentence.
- Shoot landscape for the website hero and square (1080 × 1080) for Marketplace. Keep the sign straight and fill at least half the frame.
- No stock photos, no stock families, no filters. When there's no photo yet, show the sign illustration on a birch panel instead.

## Marketplace

- Profile picture: `cc-avatar.png`.
- Listing photo 1 is always the real sign. Photo 2 is the Marketplace post layout (see `components/MarketplacePost.md`): char ground, the sign on birch, the product name in `display-m`, the price in `display-s`, and the stamp in the corner.
- Listing title: product, size, material. "Custom family name sign, 36 in, birch".
- First line of the description: what it is and the price. Second line: "Design yours at canadas-craftsmen.vercel.app". Third line: "Pickup in Sherwood Park, usually within 7 days."

## Iconography

The brand needs very few icons. Where the site needs them (check marks in the order flow, an error icon, an arrow in a carousel), use Lucide outline icons at 20 px with a 1.75 px stroke, coloured `ink`, `success` or `danger`. The leaf is the logo, not an icon: never use it as a bullet, a rating or a decoration.

## Files

- Fonts: Alfa Slab One and Archivo, both free under the SIL Open Font License (licences in `fonts/`). Self-host the woff2 files; don't load them from Google.
- Brand board: `brand-board.png` is a one-page summary.
