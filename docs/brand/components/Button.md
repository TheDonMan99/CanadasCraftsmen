# Button

Buttons start the few things a customer does: design a sign, approve a proof, send an order.

- **Primary** (`cc-btn cc-btn--primary`): `brand` fill, `on-brand` text. At most one per screen, for the thing the screen is for. "Design your sign" is the site's main one.
- **Secondary** (`cc-btn--secondary`): transparent with a `line-strong` border, for the second choice next to a primary, such as "See all signs".
- **Birch** (`cc-btn--birch`): the main button inside a `cc-band`, where a red button would fight the leaf.
- Provide the label as children: verb first, sentence case, no arrow or emoji. Keep the same words through the flow ("Approve proof" leads to "Proof approved").
- 48px tall so it is easy to tap on a phone. Use `<a>` for navigation and `<button>` for actions; a disabled button needs the reason written next to it.
- Focus ring: 2px `focus`, 2px offset. Inside `cc-band` it switches to birch automatically.
