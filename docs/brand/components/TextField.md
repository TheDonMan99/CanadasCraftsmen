# TextField

A labelled text input for the sign designer and order form.

- Provide: a visible label (`label`, sentence case), the input, and optionally a hint (`small`, `ink-muted`) connected with `aria-describedby`.
- Inputs are 48px tall on `surface-raised` with a `line-strong` `edge-kerf` border and `radius-sm` corners.
- Errors: add `cc-field--invalid`, set `aria-invalid`, and replace the hint with `cc-field__error`, which shows an icon and a sentence in `danger`. The sentence says what's wrong and how to fix it, and never apologises.
- Placeholder text never replaces the label.
