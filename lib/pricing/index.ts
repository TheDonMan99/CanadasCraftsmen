// The price calculator. Pure: catalog + settings + selections in, a line-by-line
// breakdown in cents out. The server always recalculates with this; whatever
// price a browser sends is ignored.
//
// Formula (SPEC.md, "Price formula"):
//   size (preset, or custom width interpolated and rounded up to the next $5)
//   + style + backer + material + finish + colours + topcoat + flat add-ons
//   + rush (percent of that subtotal) + delivery − promo
//   → minimum order price → GST if on → rounded to the nearest $1.

import type { CatalogOption, Settings } from '@/lib/config/catalog';

export interface QuoteInput {
  productId: string;
  styleId: string;
  /** Preset size id (size.w36, size.leaner-h46) or size.custom. */
  sizeId: string;
  /** Width for size.custom. */
  customWidthIn?: number;
  /** Actual sign width, for per-inch prices; defaults to the ordered width. */
  widthIn?: number;
  backerId?: string | null;
  materialId: string;
  finishId: string;
  /** Paint or stain ids, one per coloured piece. */
  colourIds?: string[];
  topcoatId?: string | null;
  addonIds?: string[];
  placementId: string;
  deliveryId: string;
  promo?: { kind: 'flat' | 'percent'; value: number; code?: string } | null;
}

export interface QuoteLine {
  key: string;
  optionId?: string;
  label: string;
  cents: number;
  note?: string;
}

export interface Quote {
  ok: boolean;
  errors: string[];
  lines: QuoteLine[];
  subtotalCents: number;
  rushCents: number;
  deliveryCents: number;
  deliveryQuoted: boolean;
  promoCents: number;
  minimumAppliedCents: number;
  gstCents: number;
  totalCents: number;
  amountDueCents: number;
  widthIn: number | null;
  heightIn: number | null;
  /** Topcoat actually used (covered outdoor forces the exterior topcoat). */
  topcoatId: string | null;
}

const appliesTo = (o: CatalogOption, ...ids: (string | null | undefined)[]) => !o.applies_to?.length || ids.some((id) => id && o.applies_to!.includes(id));

/** Custom width priced between the two nearest presets (extended past the ends), rounded up. */
export function customWidthPrice(presets: { widthIn: number; cents: number }[], widthIn: number, roundUpToCents: number): number {
  const ps = [...presets].sort((a, b) => a.widthIn - b.widthIn);
  if (!ps.length) return 0;
  const exact = ps.find((p) => p.widthIn === widthIn);
  let cents: number;
  if (exact) cents = exact.cents;
  else if (ps.length === 1) cents = ps[0].cents;
  else {
    let i = ps.findIndex((p) => p.widthIn > widthIn);
    if (i <= 0) i = i === 0 ? 1 : ps.length - 1;
    const a = ps[i - 1], b = ps[i];
    cents = a.cents + ((widthIn - a.widthIn) / (b.widthIn - a.widthIn)) * (b.cents - a.cents);
  }
  cents = Math.max(0, cents);
  return roundUpToCents > 0 ? Math.ceil(cents / roundUpToCents - 1e-9) * roundUpToCents : Math.round(cents);
}

export function quote(input: QuoteInput, catalog: CatalogOption[], settings: Settings): Quote {
  const errors: string[] = [];
  const lines: QuoteLine[] = [];
  const byId = new Map(catalog.map((o) => [o.id, o]));
  const get = (id: string | null | undefined, category: string, what: string, required = true): CatalogOption | null => {
    if (!id) {
      if (required) errors.push(`Pick a ${what}.`);
      return null;
    }
    const o = byId.get(id);
    if (!o || o.category !== category) {
      errors.push(`Unknown ${what}: ${id}.`);
      return null;
    }
    if (!o.enabled) errors.push(`${o.label} isn't available right now.`);
    return o;
  };

  const product = get(input.productId, 'product', 'product');
  const style = get(input.styleId, 'style', 'construction style');
  const size = get(input.sizeId, 'size', 'size');
  const material = get(input.materialId, 'material', 'material');
  const finish = get(input.finishId, 'finish_type', 'finish');
  const placement = get(input.placementId, 'placement', 'placement');
  const delivery = get(input.deliveryId, 'delivery', 'delivery method');

  if (product && style && !(product.values.allowed_styles ?? []).includes(style.id)) errors.push(`${style.label} isn't offered for a ${product.label.toLowerCase()}.`);
  if (product && size && product.values.allowed_sizes && size.id !== 'size.custom' && !product.values.allowed_sizes.includes(size.id))
    errors.push(`${size.label} isn't offered for a ${product.label.toLowerCase()}.`);

  // Size
  let widthIn: number | null = null, heightIn: number | null = null;
  const largest = settings.machine.largest_sign_in;
  if (size) {
    if (size.values.kind === 'custom_width') {
      const w = input.customWidthIn ?? NaN;
      const min = size.values.min_width_in ?? settings.sizes.custom_width_min_in;
      if (!(w >= min && w <= largest)) errors.push(`Custom width must be between ${min} and ${largest} in.`);
      else {
        widthIn = w;
        const presets = catalog
          .filter((o) => o.category === 'size' && o.enabled && o.values.kind === 'width' && o.price_type !== 'none')
          .map((o) => ({ widthIn: o.values.width_in as number, cents: o.price_value }));
        const cents = customWidthPrice(presets, w, size.values.round_up_to_cents ?? 500);
        lines.push({ key: 'size', optionId: size.id, label: `Custom width, ${w} in`, cents });
      }
    } else {
      if (size.values.kind === 'height') heightIn = size.values.height_in;
      else widthIn = size.values.width_in;
      lines.push({ key: 'size', optionId: size.id, label: size.label, cents: size.price_value });
    }
  }
  const perInchWidth = input.widthIn ?? widthIn ?? 0;

  const optionCents = (o: CatalogOption): number => {
    switch (o.price_type) {
      case 'flat': return o.price_value;
      case 'per_inch': return Math.round(o.price_value * perInchWidth);
      default: return 0; // percent options are applied to the subtotal below
    }
  };
  const add = (key: string, o: CatalogOption | null, labelPrefix = '') => {
    if (!o) return;
    lines.push({ key, optionId: o.id, label: labelPrefix + o.label, cents: optionCents(o) });
  };

  add('style', style);

  // Backer: needed by backer styles, or forced by the product (round door sign)
  const forcedBacker = product?.values.forced_backer as string | undefined;
  const needsBacker = !!style?.values.needs_backer;
  if (needsBacker) {
    const backer = get(forcedBacker ?? input.backerId, 'backer_shape', 'backer shape');
    if (backer && !appliesTo(backer, style?.id, product?.id)) errors.push(`${backer.label} isn't offered with ${style?.label}.`);
    add('backer', backer, 'Backer: ');
  }

  // Material, with indoor-only materials refused outdoors
  if (material && placement?.values.hides_indoor_only_materials && material.values.indoor_only)
    errors.push(`${material.label} is for indoor signs only.`);
  add('material', material);

  // Finish and colours: one colour per kind the finish asks for
  add('finish', finish);
  const kinds: string[] = finish?.values.colour_kinds ?? [];
  const colours = input.colourIds ?? [];
  if (finish && colours.length !== kinds.length)
    errors.push(kinds.length ? `${finish.label} needs ${kinds.length} colour${kinds.length > 1 ? 's' : ''}.` : `${finish.label} doesn't take a colour.`);
  colours.slice(0, kinds.length).forEach((cid, i) => {
    const kind = kinds[i];
    const allowed = kind === 'paint_or_stain' ? ['paint', 'stain'] : [kind];
    const o = byId.get(cid);
    if (!o || !allowed.includes(o.category)) return errors.push(`Unknown colour: ${cid}.`);
    if (!o.enabled) errors.push(`${o.label} isn't available right now.`);
    add(`colour${i + 1}`, o, `${o.category === 'stain' ? 'Stain' : 'Paint'}: `);
  });

  // Topcoat: covered outdoor forces the exterior one
  const placementKey = placement?.values.key as string | undefined;
  const forcedTopcoat = catalog.find((o) => o.category === 'topcoat' && o.enabled && o.values.automatic && (o.values.for_placement ?? []).includes(placementKey));
  let topcoat: CatalogOption | null = null;
  if (forcedTopcoat) topcoat = forcedTopcoat;
  else if (input.topcoatId) topcoat = get(input.topcoatId, 'topcoat', 'topcoat');
  else topcoat = catalog.find((o) => o.category === 'topcoat' && o.enabled && o.values.default_for === placementKey) ?? null;
  if (topcoat && finish?.id === 'finish.raw' && !topcoat.values.raw_only && !forcedTopcoat) {
    // raw wood takes no clear coat unless the placement needs one
    topcoat = catalog.find((o) => o.category === 'topcoat' && o.values.raw_only) ?? topcoat;
  }
  if (topcoat) add('topcoat', topcoat, 'Topcoat: ');

  // Add-ons: flat and per-inch now, percent (rush) after the subtotal
  const addons = (input.addonIds ?? []).map((id) => get(id, 'addon', 'add-on')).filter((o): o is CatalogOption => !!o);
  for (const a of addons) if (a.price_type !== 'percent') add(`addon:${a.id}`, a);

  const subtotalCents = lines.reduce((s, l) => s + l.cents, 0);
  let rushCents = 0;
  for (const a of addons.filter((x) => x.price_type === 'percent')) {
    const c = Math.round((subtotalCents * a.price_value) / 100);
    rushCents += c;
    lines.push({ key: `addon:${a.id}`, optionId: a.id, label: `${a.label} (${a.price_value}%)`, cents: c });
  }

  let deliveryCents = 0, deliveryQuoted = false;
  if (delivery) {
    deliveryQuoted = !!delivery.values.quoted;
    deliveryCents = deliveryQuoted ? 0 : optionCents(delivery);
    lines.push({ key: 'delivery', optionId: delivery.id, label: delivery.label, cents: deliveryCents, note: deliveryQuoted ? 'Quoted separately' : undefined });
  }

  let running = subtotalCents + rushCents + deliveryCents;
  let promoCents = 0;
  if (input.promo && settings.pricing.promo_codes_enabled) {
    promoCents = input.promo.kind === 'percent' ? Math.round((running * input.promo.value) / 100) : input.promo.value;
    promoCents = Math.min(promoCents, running);
    running -= promoCents;
    lines.push({ key: 'promo', label: input.promo.code ? `Promo ${input.promo.code}` : 'Promo', cents: -promoCents });
  }

  let minimumAppliedCents = 0;
  if (running < settings.pricing.minimum_order_cents) {
    minimumAppliedCents = settings.pricing.minimum_order_cents - running;
    running = settings.pricing.minimum_order_cents;
    lines.push({ key: 'minimum', label: 'Minimum order', cents: minimumAppliedCents });
  }

  let gstCents = 0;
  if (settings.tax.gst_enabled) {
    gstCents = Math.round((running * settings.tax.gst_rate_pct) / 100);
    running += gstCents;
    lines.push({ key: 'gst', label: `GST (${settings.tax.gst_rate_pct}%)`, cents: gstCents });
  }

  const step = settings.pricing.round_total_to_cents || 1;
  const totalCents = Math.round(running / step) * step;
  if (totalCents !== running) lines.push({ key: 'rounding', label: 'Rounding', cents: totalCents - running });

  return {
    ok: errors.length === 0,
    errors,
    lines,
    subtotalCents,
    rushCents,
    deliveryCents,
    deliveryQuoted,
    promoCents,
    minimumAppliedCents,
    gstCents,
    totalCents,
    amountDueCents: Math.round((totalCents * settings.payments.amount_due_pct) / 100),
    widthIn,
    heightIn,
    topcoatId: topcoat?.id ?? null,
  };
}

export const dollars = (cents: number) => `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(Math.abs(cents) % 100 ? 2 : 0)}`;
