// A customer's design as picked on the order form: catalog ids plus the text.
// Pure functions turn it into the engine's design (for the preview and the cut
// file) and the price calculator's input, so the browser and the server agree.

import { byCategory, type CatalogOption, type Settings } from '@/lib/config/catalog';
import type { BackerSpec, ColourPiece, Design, LineRole, StyleKey } from '@/lib/engine/types';
import type { QuoteInput } from '@/lib/pricing';

export interface OrderLine {
  role: LineRole;
  text: string;
  fontId: string;
}

export interface OrderDesign {
  productId: string;
  lines: OrderLine[];
  /** Preset size id, or size.custom with customWidthIn. */
  sizeId: string;
  customWidthIn?: number;
  styleId: string;
  backerId?: string | null;
  materialId: string;
  finishId: string;
  /** One paint or stain per colour the finish asks for. */
  colourIds: string[];
  topcoatId?: string | null;
  placementId: string;
  addonIds: string[];
  deliveryId: string;
}

// Engine style for each construction style. A style can also name its own in values.engine_style.
const STYLE_KEYS: Record<string, StyleKey> = {
  'style.one-piece': 'one_piece',
  'style.layered': 'layered',
  'style.letters-on-backer': 'letters_on_backer',
  'style.stencil': 'stencil',
};
export const engineStyle = (o: CatalogOption | undefined): StyleKey => (o?.values.engine_style as StyleKey) ?? STYLE_KEYS[o?.id ?? ''] ?? 'one_piece';

const find = (catalog: CatalogOption[], id: string | null | undefined) => (id ? catalog.find((o) => o.id === id) : undefined);
const addonWith = (catalog: CatalogOption[], d: OrderDesign, engineFlag: string) =>
  d.addonIds.some((id) => find(catalog, id)?.values.engine === engineFlag);

/** Fonts a line may use: enabled, allowed by the product, and allowed on that line. */
export function fontsFor(catalog: CatalogOption[], productId: string, role: LineRole): CatalogOption[] {
  const product = find(catalog, productId);
  const allowed: string[] | undefined = product?.values.allowed_fonts;
  return byCategory(catalog, 'font').filter((f) => (!allowed || allowed.includes(f.id)) && (f.values.allowed_lines ?? []).includes(role));
}

export function stylesFor(catalog: CatalogOption[], productId: string): CatalogOption[] {
  const allowed: string[] = find(catalog, productId)?.values.allowed_styles ?? [];
  return byCategory(catalog, 'style').filter((s) => allowed.includes(s.id));
}

/** Size presets a product offers, plus custom width for horizontal signs when it's on. */
export function sizesFor(catalog: CatalogOption[], productId: string): CatalogOption[] {
  const product = find(catalog, productId);
  const allowed: string[] | undefined = product?.values.allowed_sizes;
  const vertical = product?.values.layout === 'vertical';
  return byCategory(catalog, 'size').filter((s) => {
    if (s.values.kind === 'custom_width') return !vertical && !product?.values.forced_backer;
    if (vertical !== (s.values.kind === 'height')) return false;
    return !allowed || allowed.includes(s.id);
  });
}

export function backersFor(catalog: CatalogOption[], d: Pick<OrderDesign, 'productId' | 'styleId'>): CatalogOption[] {
  const forced = find(catalog, d.productId)?.values.forced_backer as string | undefined;
  if (forced) return catalog.filter((o) => o.id === forced);
  return byCategory(catalog, 'backer_shape').filter((b) => !b.applies_to?.length || b.applies_to.includes(d.styleId));
}

export function materialsFor(catalog: CatalogOption[], placementId: string): CatalogOption[] {
  const outdoor = !!find(catalog, placementId)?.values.hides_indoor_only_materials;
  return byCategory(catalog, 'material').filter((m) => !(outdoor && m.values.indoor_only));
}

/** Topcoats the customer can choose for a placement and finish ([] when one is forced). */
export function topcoatsFor(catalog: CatalogOption[], placementId: string, finishId: string): CatalogOption[] {
  const key = find(catalog, placementId)?.values.key;
  const all = byCategory(catalog, 'topcoat').filter((t) => (t.values.for_placement ?? []).includes(key));
  if (all.some((t) => t.values.automatic)) return [];
  if (finishId === 'finish.raw') return all.filter((t) => t.values.raw_only);
  return all.filter((t) => !t.values.raw_only);
}

export const needsBacker = (catalog: CatalogOption[], styleId: string) => !!find(catalog, styleId)?.values.needs_backer;
export const isVertical = (catalog: CatalogOption[], productId: string) => find(catalog, productId)?.values.layout === 'vertical';

/** A starting design for a product: its default lines and size, and the first option that's on everywhere else. */
export function defaultDesign(catalog: CatalogOption[], settings: Settings, productId?: string): OrderDesign {
  const product = find(catalog, productId) ?? byCategory(catalog, 'product')[0];
  const pid = product?.id ?? '';
  const lines: OrderLine[] = ((product?.values.lines ?? []) as { role: LineRole; text: string; font?: string }[]).map((l) => {
    const fonts = fontsFor(catalog, pid, l.role);
    // the line's own starting font, else a font made for small lines, else the first that's on
    const font = fonts.find((f) => f.id === l.font) ?? (l.role === 'small' ? fonts.find((f) => f.values.allowed_lines?.length === 1) : undefined) ?? fonts[0];
    return { role: l.role, text: l.text, fontId: font?.id ?? '' };
  });
  const sizes = sizesFor(catalog, pid);
  const wanted = product?.values.layout === 'vertical' ? product?.values.default_height_in : product?.values.default_width_in;
  const preset = sizes.find((s) => (s.values.width_in ?? s.values.height_in) === wanted && s.values.kind !== 'custom_width');
  const custom = sizes.find((s) => s.values.kind === 'custom_width');
  const styles = stylesFor(catalog, pid);
  const style = styles.find((s) => s.values.default) ?? styles[0];
  const placement = byCategory(catalog, 'placement')[0];
  const base: OrderDesign = {
    productId: pid,
    lines,
    sizeId: preset?.id ?? (wanted && custom ? custom.id : sizes.find((s) => s.values.kind !== 'custom_width')?.id ?? ''),
    customWidthIn: !preset && wanted && custom ? Math.min(wanted, settings.machine.largest_sign_in) : undefined,
    styleId: style?.id ?? '',
    backerId: null,
    materialId: materialsFor(catalog, placement?.id ?? '')[0]?.id ?? '',
    finishId: byCategory(catalog, 'finish_type')[0]?.id ?? '',
    colourIds: [],
    topcoatId: null,
    placementId: placement?.id ?? '',
    addonIds: [],
    deliveryId: byCategory(catalog, 'delivery')[0]?.id ?? '',
  };
  return normalizeDesign(base, catalog);
}

/**
 * Keeps a design consistent after any change: a backer only when the style needs one,
 * the right number of colours for the finish, fonts and sizes the product allows.
 */
export function normalizeDesign(d: OrderDesign, catalog: CatalogOption[]): OrderDesign {
  const out: OrderDesign = { ...d, lines: d.lines.map((l) => ({ ...l })), colourIds: [...d.colourIds], addonIds: [...d.addonIds] };
  const styles = stylesFor(catalog, out.productId);
  if (!styles.some((s) => s.id === out.styleId)) out.styleId = (styles.find((s) => s.values.default) ?? styles[0])?.id ?? out.styleId;
  if (needsBacker(catalog, out.styleId)) {
    const backers = backersFor(catalog, out);
    if (!backers.some((b) => b.id === out.backerId)) out.backerId = backers[0]?.id ?? null;
  } else out.backerId = null;
  const sizes = sizesFor(catalog, out.productId);
  if (!sizes.some((s) => s.id === out.sizeId)) out.sizeId = sizes.find((s) => s.values.kind !== 'custom_width')?.id ?? out.sizeId;
  if (find(catalog, out.sizeId)?.values.kind !== 'custom_width') delete out.customWidthIn;
  for (const l of out.lines) {
    const fonts = fontsFor(catalog, out.productId, l.role);
    if (!fonts.some((f) => f.id === l.fontId)) l.fontId = fonts[0]?.id ?? l.fontId;
  }
  const mats = materialsFor(catalog, out.placementId);
  if (!mats.some((m) => m.id === out.materialId)) out.materialId = mats[0]?.id ?? out.materialId;
  const kinds: string[] = find(catalog, out.finishId)?.values.colour_kinds ?? [];
  out.colourIds = kinds.map((kind, i) => {
    const ok = kind === 'paint_or_stain' ? ['paint', 'stain'] : [kind];
    const cur = find(catalog, out.colourIds[i]);
    return cur && cur.enabled && ok.includes(cur.category) ? cur.id : byCategory(catalog, ok[0])[0]?.id ?? '';
  });
  const coats = topcoatsFor(catalog, out.placementId, out.finishId);
  if (!coats.length || !coats.some((t) => t.id === out.topcoatId)) out.topcoatId = coats.length ? (coats.find((t) => t.values.default_for) ?? coats[0]).id : null;
  out.addonIds = [...new Set(out.addonIds)].filter((id) => find(catalog, id)?.enabled);
  return out;
}

/** The engine's design for this order. */
export function engineDesign(d: OrderDesign, catalog: CatalogOption[], settings: Settings): Design {
  const product = find(catalog, d.productId);
  const size = find(catalog, d.sizeId);
  const style = find(catalog, d.styleId);
  const vertical = product?.values.layout === 'vertical';
  const engraveSmall = addonWith(catalog, d, 'engrave_small_line');
  let backer: BackerSpec | undefined;
  const b = needsBacker(catalog, d.styleId) ? find(catalog, (product?.values.forced_backer as string) ?? d.backerId) : undefined;
  if (b)
    backer = {
      shape: b.values.shape,
      paddingIn: settings.engine.backer_padding_in,
      ...(b.values.corner_radius_in != null && { cornerRadiusIn: b.values.corner_radius_in }),
      ...(b.values.plank_width_in != null && { plankWidthIn: b.values.plank_width_in }),
    };
  return {
    layout: vertical ? 'vertical' : 'horizontal',
    style: engineStyle(style),
    widthIn: vertical ? undefined : size?.values.kind === 'custom_width' ? d.customWidthIn : size?.values.width_in,
    heightIn: vertical ? size?.values.height_in : undefined,
    lines: d.lines.filter((l) => l.text.trim()).map((l) => ({ role: l.role, text: l.text.trim(), fontId: l.fontId, ...(l.role === 'small' && engraveSmall && { engraved: true }) })),
    ...(backer && { backer }),
    floatingBits: settings.engine.floating_bits as Design['floatingBits'],
    keyholes: addonWith(catalog, d, 'keyholes'),
    leanerFoot: settings.engine.leaner_foot,
  };
}

/** The price calculator's input. widthIn is the sign's real width, for per-inch prices. */
export function quoteInput(d: OrderDesign, widthIn?: number): QuoteInput {
  return {
    productId: d.productId,
    styleId: d.styleId,
    sizeId: d.sizeId,
    customWidthIn: d.customWidthIn,
    widthIn,
    backerId: d.backerId,
    materialId: d.materialId,
    finishId: d.finishId,
    colourIds: d.colourIds,
    topcoatId: d.topcoatId,
    addonIds: d.addonIds,
    placementId: d.placementId,
    deliveryId: d.deliveryId,
  };
}

/** Preview colour for each piece of the sign, from the finish and the colours picked. */
export function previewColours(d: OrderDesign, catalog: CatalogOption[]): Partial<Record<ColourPiece, string>> {
  const wood = find(catalog, d.materialId)?.values.preview_hex ?? '#E3C9A0';
  const picked = d.colourIds.map((id) => find(catalog, id)?.values.hex as string | undefined);
  const pieces: ColourPiece[] = find(catalog, d.styleId)?.values.colour_pieces ?? ['word'];
  const out: Partial<Record<ColourPiece, string>> = {};
  for (const p of ['word', 'top', 'outline', 'letters', 'backer', 'panel'] as ColourPiece[]) out[p] = picked[0] ?? wood;
  pieces.forEach((p, i) => (out[p] = picked[i] ?? picked[0] ?? wood));
  return out;
}

/** Labels of everything picked, saved with the order so later catalog edits never change it. */
export function designLabels(d: OrderDesign, catalog: CatalogOption[]) {
  const label = (id: string | null | undefined) => find(catalog, id)?.label ?? '';
  return {
    product: label(d.productId),
    lines: d.lines.filter((l) => l.text.trim()).map((l) => ({ role: l.role, text: l.text.trim(), font: label(l.fontId) })),
    size: find(catalog, d.sizeId)?.values.kind === 'custom_width' ? `${d.customWidthIn} in wide (custom)` : label(d.sizeId),
    style: label(d.styleId),
    backer: needsBacker(catalog, d.styleId) ? label(find(catalog, d.productId)?.values.forced_backer ?? d.backerId) : '',
    material: label(d.materialId),
    finish: label(d.finishId),
    colours: d.colourIds.map(label),
    topcoat: label(d.topcoatId),
    placement: label(d.placementId),
    addons: d.addonIds.map(label),
    delivery: label(d.deliveryId),
  };
}
export type DesignLabels = ReturnType<typeof designLabels>;

/** Checks the engine and price calculator don't make: the product's own rules for this design. */
export function checkOrderDesign(d: OrderDesign, catalog: CatalogOption[]): string[] {
  const errors: string[] = [];
  const product = find(catalog, d.productId);
  if (!product || product.category !== 'product' || !product.enabled) return ['Pick a product.'];
  const maxLines = product.values.max_lines ?? Math.max(3, (product.values.lines ?? []).length);
  if (!Array.isArray(d.lines) || d.lines.length > maxLines) errors.push(`A ${product.label.toLowerCase()} has up to ${maxLines} lines.`);
  for (const l of d.lines ?? []) {
    if (!['top', 'main', 'small'].includes(l.role) || typeof l.text !== 'string') {
      errors.push('A text line is not valid.');
      continue;
    }
    if (l.text.trim() && !fontsFor(catalog, d.productId, l.role).some((f) => f.id === l.fontId))
      errors.push(`${find(catalog, l.fontId)?.label ?? 'That font'} isn't offered for this line.`);
  }
  if (!d.lines?.some((l) => l.role === 'main' && l.text.trim())) errors.push('Type the main line of the sign.');
  if (!sizesFor(catalog, d.productId).some((s) => s.id === d.sizeId)) errors.push('Pick a size this product offers.');
  if (!materialsFor(catalog, d.placementId).some((m) => m.id === d.materialId)) errors.push('Pick a material that suits where the sign will hang.');
  if (addonWith(catalog, d, 'engrave_small_line') && !d.lines.some((l) => l.role === 'small' && l.text.trim()))
    errors.push('The engraved small line add-on needs a small line of text.');
  const coats = topcoatsFor(catalog, d.placementId, d.finishId);
  if (coats.length && d.topcoatId && !coats.some((t) => t.id === d.topcoatId)) errors.push('Pick a topcoat that suits the finish and placement.');
  return errors;
}
