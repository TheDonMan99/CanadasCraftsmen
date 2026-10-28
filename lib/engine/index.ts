// The cut-file engine: design in, cut-ready geometry and a report out.
// Pure functions only, so the browser preview and the server's final files match.
//
// Pipeline: validate -> lay out text -> scale -> connect into one piece ->
// floating bits -> style pieces -> extras -> kerf -> clean up -> check and report.

import { checkThin } from './check';
import {
  attachBits,
  baselineBar,
  bodyNodes,
  bridgeGroups,
  components,
  isWelded,
  JOINT_FACTOR,
  joinLines,
  makeNode,
  type Connector,
} from './connect';
import {
  area,
  bounds,
  boundsH,
  boundsW,
  difference,
  fillHoles,
  intersect,
  offset,
  perimeter,
  pieces,
  rect,
  simplify,
  translate,
  union,
} from './geom';
import { blockSize1, inkWidth1, layoutLine, lineRatio, placeLine, stackLines, type Element, type LineLayout } from './layout';
import { backerScale, backerShape, clipLines, keyholeShape, placeKeyholes, type BackerParams } from './shapes';
import type {
  Design,
  EngineContext,
  EngineResult,
  Issue,
  LineReport,
  Part,
  Pt,
  Shape,
  ThinSpot,
} from './types';
import { buildVertical } from './vertical';

export * from './types';
export { loadFont, type LoadedFont } from './font';

const CONNECT_STYLES = new Set(['one_piece', 'layered']);

export function backerParams(design: Design, ctx: EngineContext): BackerParams {
  return {
    shape: design.backer?.shape ?? 'rectangle',
    paddingIn: design.backer?.paddingIn ?? ctx.settings.backer_padding_in,
    cornerRadiusIn: design.backer?.cornerRadiusIn ?? 1,
    plankWidthIn: design.backer?.plankWidthIn ?? 5.5,
    archRiseRatio: 0.15,
  };
}

/** Checks that need no geometry: text, fonts, line rules and character limits. */
export function validateDesign(design: Design, ctx: EngineContext): Issue[] {
  const out: Issue[] = [];
  const lines = design.lines.filter((l) => l.text.trim());
  if (!lines.length) out.push({ code: 'empty_text', message: 'Type some text for the sign.' });
  for (const l of lines) {
    const f = ctx.fonts[l.fontId];
    if (!f) {
      out.push({ code: 'invalid_design', message: `Unknown font ${l.fontId}.` });
      continue;
    }
    if (!f.spec.allowedLines.includes(l.role))
      out.push({ code: 'font_not_allowed_for_line', message: `${f.spec.label} isn't offered for the ${l.role} line.`, detail: { font: l.fontId, role: l.role } });
    const missing = [...new Set([...l.text].filter((c) => !f.font.hasChar(c)))];
    if (missing.length)
      out.push({ code: 'missing_glyphs', message: `${f.spec.label} doesn't have ${missing.join(' ')}.`, detail: { chars: missing } });
    const max = ctx.sizes.max_chars[l.role];
    if ([...l.text].length > max)
      out.push({ code: 'too_many_chars', message: `The ${l.role} line allows up to ${max} characters.`, detail: { max } });
    if (l.engraved && l.role !== 'small') out.push({ code: 'invalid_design', message: 'Only the small line can be engraved.' });
  }
  const engraved = lines.some((l) => l.engraved);
  if (engraved && (design.layout === 'vertical' || CONNECT_STYLES.has(design.style)))
    out.push({ code: 'engraved_needs_backer', message: 'An engraved small line needs a backer or panel to sit on. Cut it instead, or pick letters on backer or stencil.' });
  if (design.layout === 'vertical' && !CONNECT_STYLES.has(design.style))
    out.push({ code: 'invalid_design', message: 'Porch leaners are cut as one-piece or layered words.' });
  if (design.layout === 'horizontal' && !(design.widthIn && design.widthIn > 0)) out.push({ code: 'invalid_design', message: 'Pick a width.' });
  if (design.layout === 'vertical' && !(design.heightIn && design.heightIn > 0)) out.push({ code: 'invalid_design', message: 'Pick a height.' });
  return out;
}

interface WordBuild {
  word: Shape;
  connectors: Connector[];
  lines: LineReport[];
  failures: Issue[];
  s: number;
  engrave: Shape;
  textBounds: ReturnType<typeof bounds>;
  topLetter?: Shape;
}

/** Horizontal one-piece word: connect each line, attach bits, join the lines. */
function buildHorizontalWord(design: Design, ctx: EngineContext, lines: Design['lines'], textWidth: number): WordBuild {
  const st = ctx.settings;
  const ov = st.weld_overlap_in;
  const joint = ctx.material.minFeatureIn * JOINT_FACTOR;
  const failures: Issue[] = [];
  const trackings = lines.map(() => 0);
  const layoutsAt = () => lines.map((l, i) => layoutLine(l, i, ctx, trackings[i]));
  const scaleFor = (ls: LineLayout[]) => {
    const widest = ls.reduce((a, b) => (inkWidth1(b) > inkWidth1(a) ? b : a));
    return (textWidth - 2 * widest.thickenIn) / Math.max(1e-6, blockSize1(ls, ctx).w);
  };

  // Weld, then tighten: per cut line, widest first.
  const methods: LineReport['method'][] = lines.map(() => 'failed');
  const order = lines.map((_, i) => i).filter((i) => !lines[i].engraved);
  const l0 = layoutsAt();
  order.sort((a, b) => inkWidth1(l0[b]) - inkWidth1(l0[a]));
  for (const i of order) {
    let welded = false;
    for (let pct = 0; pct <= st.max_tighten_pct + 1e-9; pct += st.tighten_step_pct) {
      trackings[i] = pct;
      const ls = layoutsAt();
      const s = scaleFor(ls);
      if (isWelded(placeLine(ls[i], s, 0, 0), ov, joint)) {
        methods[i] = pct === 0 ? 'weld' : 'tighten';
        welded = true;
        break;
      }
    }
    if (!welded) trackings[i] = 0;
  }

  const layouts = layoutsAt();
  const s = scaleFor(layouts);
  const placed = stackLines(layouts, s, ctx);
  const connectors: Connector[] = [];
  const lineShapes: Shape[] = [];
  let engrave: Shape = [];
  const reports: LineReport[] = [];

  placed.forEach((pl, i) => {
    const line = lines[i];
    const report: LineReport = { role: line.role, text: line.text, fontId: line.fontId, letterHeightIn: lineRatio(line, ctx) * s, method: methods[i], tightenPct: trackings[i], engraved: !!line.engraved };
    reports.push(report);
    if (line.engraved) {
      // engraved lines aren't thickened or connected; they're filled areas
      const raw = placeLine({ ...pl.layout, thickenIn: 0 }, s, pl.offsetX, pl.baselineY);
      engrave = union(engrave, ...raw.map((e) => e.shape));
      return;
    }
    const lineConnectors: Connector[] = [];
    let ok = isWelded(pl.elements, ov, joint);
    if (!ok) {
      const nodes = bodyNodes(pl.elements, ov);
      const bar = baselineBar(pl.elements, pl.baselineY, st);
      const withBar = bar ? [...nodes, makeNode(bar.shape, '', ov)] : nodes;
      if (bar) lineConnectors.push(bar);
      const groups = components(withBar, joint);
      if (groups.length <= 1) {
        report.method = 'baseline_bar';
        ok = true;
      } else {
        const res = bridgeGroups(
          groups.map((g) => ({ shape: union(...g.map((j) => withBar[j].shape)), chars: g.map((j) => withBar[j].chars).join('') })),
          st.bridge_width_in,
          st,
        );
        lineConnectors.push(...res.bridges);
        report.method = res.loose.length ? 'failed' : 'bridges';
        if (res.loose.length)
          failures.push({ code: 'not_one_piece', message: `These letters don't connect: ${res.loose.join(', ')}. Try letters on backer, a bigger size or another font.`, detail: { loose: res.loose, line: i } });
      }
    }
    let shape = union(...pl.elements.filter((e) => e.kind === 'body').map((e) => e.shape), ...lineConnectors.map((c) => c.shape));
    const bits = attachBits(shape, pl.elements.filter((e) => e.kind === 'bit'), design.floatingBits ?? st.floating_bits, st);
    shape = bits.shape;
    connectors.push(...lineConnectors, ...bits.connectors);
    lineShapes.push(shape);
  });

  for (let i = 1; i < lineShapes.length; i++) connectors.push(...joinLines(union(...lineShapes.slice(0, i)), lineShapes[i], st));
  const word = union(...lineShapes, ...connectors.map((c) => c.shape));
  return { word, connectors, lines: reports, failures, s, engrave, textBounds: bounds(union(word, engrave)) };
}

/** Separate letters for backer and stencil styles: no connecting, just the outlines. */
function buildLetters(design: Design, ctx: EngineContext, lines: Design['lines'], W: number, params: BackerParams) {
  const layouts = lines.map((l, i) => layoutLine(l, i, ctx, 0));
  const { w, h } = blockSize1(layouts, ctx);
  const s = backerScale(params, W, w, h);
  const placed = stackLines(layouts, s, ctx);
  const elements: Element[] = [];
  let engrave: Shape = [];
  const reports: LineReport[] = [];
  placed.forEach((pl, i) => {
    const line = lines[i];
    reports.push({ role: line.role, text: line.text, fontId: line.fontId, letterHeightIn: lineRatio(line, ctx) * s, method: 'separate', tightenPct: 0, engraved: !!line.engraved });
    if (line.engraved) {
      const raw = placeLine({ ...pl.layout, thickenIn: 0 }, s, pl.offsetX, pl.baselineY);
      engrave = union(engrave, ...raw.map((e) => e.shape));
    } else if ((design.floatingBits ?? ctx.settings.floating_bits) === 'remove') elements.push(...pl.elements.filter((e) => e.kind === 'body'));
    else elements.push(...pl.elements);
  });
  const letters = union(...elements.map((e) => e.shape));
  return { letters, elements, engrave, lines: reports, s, textBounds: bounds(union(letters, engrave)) };
}

function charsIn(shape: Shape, elements: Element[]): string {
  const b = bounds(shape);
  return elements
    .filter((e) => {
      const eb = bounds(e.shape);
      return eb.minX < b.maxX && eb.maxX > b.minX && eb.minY < b.maxY && eb.maxY > b.minY && area(intersect(e.shape, shape)) > 1e-6;
    })
    .sort((a, b) => a.lineIndex - b.lineIndex || a.charIndex - b.charIndex)
    .map((e) => e.char)
    .join('');
}

function emptyResult(failures: Issue[]): EngineResult {
  return {
    ok: false,
    failures,
    warnings: [],
    parts: [],
    score: [],
    scoreLines: [],
    engrave: [],
    thinRegions: [],
    widthIn: 0,
    heightIn: 0,
    report: {
      pieceCount: 0, expectedPieces: '', widthIn: 0, heightIn: 0, thinnest: null, cutLengthIn: 0, scoreLengthIn: 0,
      engraveAreaIn2: 0, partAreaIn2: 0, laserMinutes: 0, lines: [], pieces: [], keyholes: [], bridges: 0,
    },
  };
}

export function runEngine(design: Design, ctx: EngineContext): EngineResult {
  const st = ctx.settings;
  const mat = ctx.material;
  const failures: Issue[] = validateDesign(design, ctx);
  const warnings: Issue[] = [];
  const fatal = failures.some((f) => f.code === 'empty_text' || f.code === 'invalid_design');
  if (fatal) return emptyResult(failures);

  const lines = design.lines.filter((l) => l.text.trim());
  const W = design.widthIn ?? 0;
  const params = backerParams(design, ctx);
  type Raw = { id: string; name: string; role: Part['role']; colourPiece: Part['colourPiece']; shape: Shape; connectors: Connector[]; chars: string };
  const raws: Raw[] = [];
  let score: Shape = [];
  let scoreLines: Pt[][] = [];
  let engrave: Shape = [];
  let lineReports: LineReport[] = [];
  let connectors: Connector[] = [];
  let hangPart: Raw | null = null;
  let keyRegion: Shape | null = null;
  let allChars = lines.filter((l) => !l.engraved).map((l) => l.text.replace(/\s/g, '')).join('');

  if (CONNECT_STYLES.has(design.style)) {
    const offsetIn = design.style === 'layered' ? st.layered_outline_offset_in : 0;
    let wb: WordBuild;
    if (design.layout === 'vertical') {
      // layered leaners shrink the stack so the outline still fits the ordered height
      const vb = buildVertical({ ...design, heightIn: design.heightIn! - 2 * offsetIn }, ctx);
      wb = { ...vb, engrave: [], textBounds: bounds(vb.word) };
    } else {
      wb = buildHorizontalWord(design, ctx, lines, W - 2 * offsetIn);
    }
    failures.push(...wb.failures);
    lineReports = wb.lines;
    connectors = wb.connectors;
    engrave = wb.engrave;
    const top: Raw = { id: 'word', name: design.style === 'layered' ? 'Top word' : 'Word', role: 'word', colourPiece: design.style === 'layered' ? 'top' : 'word', shape: wb.word, connectors, chars: allChars };
    raws.push(top);
    hangPart = top;
    if (design.style === 'layered') {
      const outline: Raw = { id: 'outline', name: 'Outline layer', role: 'outline', colourPiece: 'outline', shape: offset(wb.word, offsetIn, 'round'), connectors: [], chars: '' };
      raws.push(outline);
      hangPart = outline;
    }
    if (design.layout === 'vertical') {
      keyRegion = design.keyholes ?? st.leaner_keyhole ? (wb.topLetter ?? null) : null;
    }
  } else {
    const lb = buildLetters(design, ctx, lines, W, params);
    lineReports = lb.lines;
    engrave = lb.engrave;
    const backer = backerShape(params, W, lb.textBounds);
    const shapeName = params.shape.replace('_', ' ');
    if (design.style === 'letters_on_backer') {
      const b: Raw = { id: 'backer', name: `Backer (${shapeName})`, role: 'backer', colourPiece: 'backer', shape: backer.shape, connectors: [], chars: '' };
      raws.push(b);
      hangPart = b;
      pieces(lb.letters).forEach((p, i) => {
        const chars = charsIn(p, lb.elements);
        raws.push({ id: `letter-${i + 1}`, name: chars.length > 1 ? `Letters ${chars}` : `Letter ${chars}`, role: 'letters', colourPiece: 'letters', shape: p, connectors: [], chars });
      });
      // placement guide: letter outlines scored on the backer
      score = lb.letters;
      scoreLines = clipLines(backer.scoreLines, backer.shape);
    } else {
      // stencil: letters cut out of the panel, bridges hold letter centres in
      let panel = difference(backer.shape, lb.letters);
      const bridges: Connector[] = [];
      const islands = () => pieces(panel).sort((a, b) => area(b) - area(a)).slice(1);
      const letterPieces = pieces(lb.letters);
      for (const island of st.stencil_bridges_per_hole > 0 ? islands() : []) {
        const ib = bounds(island);
        const cx = (ib.minX + ib.maxX) / 2;
        const owner = letterPieces.find((lp) => {
          const lb2 = bounds(lp);
          return lb2.minX <= ib.minX && lb2.maxX >= ib.maxX && lb2.minY <= ib.minY && lb2.maxY >= ib.maxY;
        });
        const ob = owner ? bounds(owner) : ib;
        const w = st.stencil_bridge_width_in;
        const strip = st.stencil_bridges_per_hole >= 2
          ? rect(cx - w / 2, ob.minY - 0.05, cx + w / 2, ob.maxY + 0.05)
          : rect(cx - w / 2, ob.minY - 0.05, cx + w / 2, (ib.minY + ib.maxY) / 2);
        const within = owner ? intersect(strip, offset(fillHoles(owner), 0.02)) : strip;
        bridges.push({ kind: 'stencil_bridge', shape: within, a: { x: cx, y: ob.minY }, b: { x: cx, y: ob.maxY }, widthIn: w });
        panel = union(panel, within);
      }
      const loose = islands();
      if (loose.length)
        failures.push({ code: 'loose_centres', message: `${loose.length} letter centre(s) would fall out of the panel.`, detail: { count: loose.length } });
      const p: Raw = { id: 'panel', name: `Stencil panel (${shapeName})`, role: 'panel', colourPiece: 'panel', shape: panel, connectors: bridges, chars: allChars };
      raws.push(p);
      hangPart = p;
      connectors = bridges;
      scoreLines = clipLines(backer.scoreLines, panel);
    }
    if (design.style === 'letters_on_backer' && (design.floatingBits ?? st.floating_bits) !== 'remove') allChars = lines.map((l) => l.text).join('');
  }

  // Extras: keyhole slots in the piece that hangs.
  const keyholes: Pt[] = [];
  const wantKeyholes = design.layout === 'vertical' ? !!keyRegion : !!design.keyholes;
  if (wantKeyholes && hangPart) {
    const fractions = design.layout === 'vertical' ? [0.5] : st.keyhole_positions;
    const region = keyRegion ? intersect(hangPart.shape, offset(keyRegion, 0.01)) : hangPart.shape;
    const spots = placeKeyholes(region, fractions, st, mat.minFeatureIn);
    if (spots) {
      keyholes.push(...spots);
      hangPart.shape = difference(hangPart.shape, union(...spots.map((c) => keyholeShape(c, st))));
    } else warnings.push({ code: 'keyhole_no_strong_spot', message: 'No spot is strong enough for keyhole slots; use hanging hardware instead.' });
  }

  // Move everything so the sign's top-left corner is at (0, 0).
  const all = bounds(union(...raws.map((r) => r.shape), engrave));
  const dx = -all.minX, dy = -all.minY;
  const mv = (sh: Shape) => translate(sh, dx, dy);
  const mvPt = (p: Pt) => ({ x: p.x + dx, y: p.y + dy });
  for (const r of raws) {
    r.shape = mv(r.shape);
    r.connectors = r.connectors.map((c) => ({ ...c, shape: mv(c.shape), a: c.a && mvPt(c.a), b: c.b && mvPt(c.b) }));
  }
  score = mv(score);
  scoreLines = scoreLines.map((l) => l.map(mvPt));
  engrave = mv(engrave);
  const keyholesAt = keyholes.map(mvPt);

  // Kerf and clean up.
  const tol = st.curve_tolerance_in;
  const parts: Part[] = raws.map((r) => {
    const shape = simplify(union(r.shape), tol);
    const cut = simplify(offset(shape, mat.kerfIn / 2, 'round', tol), tol);
    return { id: r.id, name: r.name, role: r.role, colourPiece: r.colourPiece, shape, cut, chars: r.chars, areaIn2: area(shape), bounds: bounds(shape) };
  });
  score = simplify(score, tol);
  engrave = simplify(engrave, tol);

  // Check and report.
  const widthIn = boundsW(all), heightIn = boundsH(all);
  if (widthIn > ctx.largestSignIn + 1e-6)
    failures.push({ code: 'too_wide', message: `The sign is ${widthIn.toFixed(2)} in wide; the largest is ${ctx.largestSignIn} in.`, detail: { widthIn } });
  if (heightIn > ctx.largestSignIn + 1e-6)
    failures.push({ code: 'too_tall', message: `The sign is ${heightIn.toFixed(2)} in tall; the largest is ${ctx.largestSignIn} in. Pick a smaller width or shorter text.`, detail: { heightIn } });
  for (const lr of lineReports) {
    const mins = ctx.sizes.min_letter_height_in;
    const min = lr.role === 'small' ? (lr.engraved ? mins.small_engraved : mins.small_cut) : mins[lr.role];
    if (lr.letterHeightIn + 1e-6 < min)
      failures.push({ code: 'letters_too_small', message: `Letters on the ${lr.role} line are ${lr.letterHeightIn.toFixed(2)} in tall; the minimum is ${min} in. Try the next size up.`, detail: { role: lr.role, heightIn: lr.letterHeightIn, min } });
  }

  // piece rules
  const pieceIssue = (msg: string, detail: Record<string, unknown>) => failures.push({ code: 'not_one_piece', message: msg, detail });
  for (const p of parts) {
    if (p.role === 'letters') continue;
    const ps = pieces(p.shape);
    if (ps.length !== 1 && !failures.some((f) => f.code === 'not_one_piece' || f.code === 'loose_centres')) {
      pieceIssue(`${p.name} comes off the laser in ${ps.length} pieces instead of 1.`, { part: p.id, pieces: ps.length });
    }
  }

  // strength
  const thinSpots: ThinSpot[] = [];
  let thinRegions: Shape = [];
  let thinnest: ThinSpot | null = null;
  parts.forEach((p, i) => {
    const res = checkThin(p.id, p.shape, raws[i].connectors, mat.minFeatureIn, st.thin_tail_ignore_len_in);
    thinSpots.push(...res.spots);
    thinRegions = union(thinRegions, res.regions);
    if (!thinnest || res.thinnestIn < thinnest.widthIn) thinnest = { partId: p.id, x: res.thinnestAt.x, y: res.thinnestAt.y, widthIn: res.thinnestIn };
  });
  if (thinSpots.length)
    failures.push({
      code: 'thin_section',
      message: `${thinSpots.length} spot(s) are thinner than the ${mat.minFeatureIn} in minimum for ${mat.label}. Try a bigger size, a thicker font or letters on backer.`,
      detail: { spots: thinSpots },
    });
  const narrow = connectors.filter((c) => c.widthIn < mat.minFeatureIn && c.kind !== 'foot');
  if (narrow.length)
    warnings.push({ code: 'narrow_bridges', message: `${narrow.length} bridge(s) are ${Math.min(...narrow.map((c) => c.widthIn))} in wide, below the ${mat.minFeatureIn} in minimum feature width; they're set in Engine settings.` });

  const cutLengthIn = parts.reduce((a, p) => a + perimeter(p.cut), 0);
  const scoreLengthIn = perimeter(score) + scoreLines.reduce((a, l) => a + perimeter([l]) - Math.hypot(l[0].x - l[l.length - 1].x, l[0].y - l[l.length - 1].y), 0);
  const engraveAreaIn2 = area(engrave);
  const speed = mat.cutSpeedInMin ?? st.default_cut_speed_in_min;
  const minutes =
    ((cutLengthIn * Math.max(1, mat.passes)) / speed + scoreLengthIn / st.score_speed_in_min + engraveAreaIn2 / st.engrave_line_interval_in / st.engrave_speed_in_min) *
    (1 + st.travel_overhead_pct / 100);
  const letterParts = parts.filter((p) => p.role === 'letters');
  const expectedPieces =
    design.style === 'one_piece' ? '1' : design.style === 'layered' ? '2' : design.style === 'stencil' ? '1 panel' : `1 backer + ${letterParts.length} letter piece(s)`;

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    parts,
    score,
    scoreLines,
    engrave,
    thinRegions,
    widthIn,
    heightIn,
    report: {
      pieceCount: parts.reduce((a, p) => a + (p.role === 'letters' ? 1 : pieces(p.shape).length), 0),
      expectedPieces,
      widthIn,
      heightIn,
      thinnest,
      cutLengthIn,
      scoreLengthIn,
      engraveAreaIn2,
      partAreaIn2: parts.reduce((a, p) => a + p.areaIn2, 0),
      laserMinutes: minutes,
      lines: lineReports,
      pieces: parts.map((p) => ({ id: p.id, name: p.name, chars: p.chars, widthIn: boundsW(p.bounds), heightIn: boundsH(p.bounds) })),
      keyholes: keyholesAt,
      bridges: connectors.filter((c) => c.kind !== 'bar' && c.kind !== 'spine' && c.kind !== 'foot').length,
    },
  };
}
