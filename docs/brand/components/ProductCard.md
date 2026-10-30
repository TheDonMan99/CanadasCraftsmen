# ProductCard

One sign type in the shop grid: photo on a birch panel, name, starting price, one line of what it comes in.

- Provide: a photo (or the sign illustration until there is one), the product name, the "From $" price and a short meta line. The whole card is one link to that sign's designer.
- The photo sits in `cc-panel cc-panel--hung`: birch with the burnt `edge-kerf` keyline and `shadow-hang`. This is the one place the hung shadow appears.
- Name in `title`, price in `display-s` (Alfa Slab One), meta in `small` and `ink-muted`.
- No borders, backgrounds or badges on the card itself, and no "Sale" or "Popular" tags. The sign is the decoration.
- Grid: one column on phones, two on tablets, three on desktop, gutters `space-6`.
