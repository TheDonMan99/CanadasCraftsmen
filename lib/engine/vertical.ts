// Vertical layout for porch leaners: letters stacked top to bottom on one centre
// line, joined by vertical overlap (scripts) or a spine bar (block fonts), an
// optional family name across the bottom and a flat base foot.

import {
  attachBits,
  baselineBar,
  bodyNodes,
  bridgeGroups,
  components,
  joinLines,
  JOINT_FACTOR,
  makeNode,
  type Connector,
} from './connect';
import { bounds, rect, scale as scaleShape, translate, union, offset } from './geom';
import { layoutLine, lineRatio, placeLine, type Element } from './layout';
import type { Design, EngineContext, Issue, LineReport, Shape } from './types';

interface StackGlyph {
  char: string;
  charIndex: number;
  /** Shapes at s = 1, bbox top-centre at (0, 0). */
  bodies: Shape[];
  bits: Shape[];
  h: number;
  w: number;
  /** Cumulative vertical profile samples (s = 1): bottom and top edge by column. */
  shape: Shape;
}

const COLUMNS = 120;

function profile(shape: Shape, xs: number[], which: 'top' | 'bottom'): number[] {
  return xs.map((x) => {
    let v = which === 'top' ? Infinity : -Infinity;
    for (const path of shape)
      for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
        const a = path[j], b = path[i];
        if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
          const y = a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
          v = which === 'top' ? Math.min(v, y) : Math.max(v, y);
        }
      }
    return v;
  });
}

/** How far the lower glyph can move up from bbox-touching before the outlines meet (s = 1). */
function stackSlack(upper: StackGlyph, lower: StackGlyph): number {
  const half = Math.min(upper.w, lower.w) / 2;
  const xs = Array.from({ length: COLUMNS }, (_, i) => -half + ((i + 0.5) / COLUMNS) * 2 * half);
  const b = profile(upper.shape, xs, 'bottom');
  const t = profile(lower.shape, xs, 'top');
  let d = Infinity;
  xs.forEach((_, i) => {
    if (isFinite(b[i]) && isFinite(t[i])) d = Math.min(d, upper.h - b[i] + t[i]);
  });
  return isFinite(d) ? Math.max(0, d) : 0;
}

export interface VerticalBuild {
  word: Shape;
  connectors: Connector[];
  lines: LineReport[];
  failures: Issue[];
  s: number;
  /** Bounds of the top letter, for the optional leaner keyhole. */
  topLetter: Shape;
}

export function buildVertical(design: Design, ctx: EngineContext): VerticalBuild {
  const st = ctx.settings;
  const failures: Issue[] = [];
  const H = design.heightIn ?? 46;
  const main = design.lines.find((l) => l.role === 'main' && l.text.trim()) ?? design.lines.find((l) => l.text.trim())!;
  const bottom = design.lines.find((l) => l !== main && l.text.trim());
  const entry = ctx.fonts[main.fontId];
  const font = entry.font;
  const k = lineRatio(main, ctx) / font.capHeight;
  const script = entry.spec.weldMode === 'script';
  const ov = st.weld_overlap_in;
  const thicken = entry.spec.autoThickenIn;

  const glyphs: StackGlyph[] = [];
  [...main.text].forEach((ch, i) => {
    if (!ch.trim()) return;
    const g = font.glyph(ch);
    if (!g.shape.length) return;
    const all = scaleShape(g.shape, k);
    const bb = bounds(all);
    const cx = (bb.minX + bb.maxX) / 2;
    const norm = (sh: Shape) => translate(scaleShape(sh, k), -cx, -bb.minY);
    glyphs.push({
      char: ch,
      charIndex: i,
      bodies: g.bodies.map(norm),
      bits: g.bits.map(norm),
      h: bb.maxY - bb.minY,
      w: bb.maxX - bb.minX,
      shape: norm(g.shape),
    });
  });
  const n = glyphs.length;
  const slack = glyphs.slice(0, -1).map((g, i) => (script ? stackSlack(g, glyphs[i + 1]) : 0));
  const maxW1 = Math.max(...glyphs.map((g) => g.w));
  const foot = design.leanerFoot ?? st.leaner_foot;

  // Family name across the bottom, capped at twice the widest letter.
  const famLayout = bottom ? layoutLine(bottom, design.lines.indexOf(bottom), ctx, 0) : null;
  let famC = 1;
  if (famLayout) {
    const w1 = (famLayout.inkMaxX - famLayout.inkMinX) * famLayout.k;
    if (w1 > 2 * maxW1) famC = (2 * maxW1) / w1;
  }

  const build = (s: number) => {
    const elements: Element[] = [];
    const tops: number[] = [];
    let y = 0;
    glyphs.forEach((g, i) => {
      if (i > 0) y += script ? -(slack[i - 1] * s + ov) : st.leaner_letter_gap_in;
      tops.push(y);
      const place = (sh: Shape) => {
        const p = translate(scaleShape(sh, s), 0, y);
        return thicken > 0 ? offset(p, thicken) : p;
      };
      for (const b of g.bodies) elements.push({ kind: 'body', char: g.char, charIndex: g.charIndex, lineIndex: 0, shape: place(b) });
      for (const b of g.bits) elements.push({ kind: 'bit', char: g.char, charIndex: g.charIndex, lineIndex: 0, shape: place(b) });
      y += g.h * s;
    });
    const stackBottom = y;
    const connectors: Connector[] = [];
    let famElements: Element[] = [];
    let famBaseline = 0;
    let lowest = stackBottom;
    if (famLayout) {
      const fs = s * famC;
      const top = stackBottom + st.line_spacing_ratio * s;
      famBaseline = top - famLayout.inkMinY * famLayout.k * fs;
      const w = (famLayout.inkMaxX - famLayout.inkMinX) * famLayout.k * fs;
      famElements = placeLine(famLayout, fs, -w / 2 - famLayout.inkMinX * famLayout.k * fs, famBaseline);
      lowest = famBaseline + famLayout.inkMaxY * famLayout.k * fs;
    }
    if (!script && n > 0) {
      const c0 = tops[0] + (glyphs[0].h * s) / 2;
      const end = famLayout ? famBaseline - (famLayout.font.capHeight * famLayout.k * s * famC) / 2 : tops[n - 1] + (glyphs[n - 1].h * s) / 2;
      const hw = st.leaner_spine_width_in / 2;
      connectors.push({ kind: 'spine', shape: rect(-hw, c0, hw, end), widthIn: st.leaner_spine_width_in });
    }
    if (foot) {
      const wf = maxW1 * s + 2 * thicken;
      connectors.push({ kind: 'foot', shape: rect(-wf / 2, lowest - ov, wf / 2, lowest - ov + st.leaner_foot_height_in), widthIn: st.leaner_foot_height_in });
    }
    return { elements, famElements, famBaseline, connectors, tops };
  };

  // Height is linear in s apart from fixed gaps; fit it to the ordered height.
  let s = 1;
  for (let it = 0; it < 4; it++) {
    const { elements, famElements, connectors } = build(s);
    const all = union(...elements.map((e) => e.shape), ...famElements.map((e) => e.shape), ...connectors.map((c) => c.shape));
    const b = bounds(all);
    const fixed = (script ? -(n - 1) * ov : (n - 1) * st.leaner_letter_gap_in) + (foot ? st.leaner_foot_height_in - ov : 0) + 2 * thicken;
    const measured = b.maxY - b.minY;
    s = Math.max(0.01, (s * (H - fixed)) / Math.max(1e-6, measured - fixed));
  }
  const { elements, famElements, famBaseline, connectors } = build(s);

  // Connect the stack. With a family name the foot sits under that line, so it
  // joins the family line rather than the letters.
  const hasFam = !!famLayout && famElements.length > 0;
  const footC = connectors.filter((c) => c.kind === 'foot');
  const stackC = hasFam ? connectors.filter((c) => c.kind !== 'foot') : connectors;
  const nodes = [...bodyNodes(elements, ov), ...stackC.map((c) => makeNode(c.shape, '', ov))];
  const lines: LineReport[] = [];
  const joint = ctx.material.minFeatureIn * JOINT_FACTOR;
  const groups = components(nodes, joint);
  let method: LineReport['method'] = script ? 'stack_overlap' : 'spine';
  const allConnectors = [...stackC];
  if (groups.length > 1) {
    const res = bridgeGroups(groups.map((g) => ({ shape: union(...g.map((i) => nodes[i].shape)), chars: g.map((i) => nodes[i].chars).join('') })), st.bridge_width_in, st);
    allConnectors.push(...res.bridges);
    method = 'bridges';
    if (res.loose.length) {
      method = 'failed';
      failures.push({ code: 'not_one_piece', message: `These letters don't connect: ${res.loose.join(', ')}. Try another font or letters on a backer.`, detail: { loose: res.loose } });
    }
  }
  let word = union(...nodes.map((nd) => nd.shape), ...allConnectors.map((c) => c.shape));
  const bits = attachBits(word, elements.filter((e) => e.kind === 'bit'), design.floatingBits ?? st.floating_bits, st);
  word = bits.shape;
  allConnectors.push(...bits.connectors);
  lines.push({ role: main.role, text: main.text, fontId: main.fontId, letterHeightIn: lineRatio(main, ctx) * s, method, tightenPct: 0, engraved: false });

  if (hasFam) {
    // the family line connects on its own, then joins the stack
    const famNodes = bodyNodes(famElements, ov);
    let famMethod: LineReport['method'] = 'weld';
    const famConnectors: Connector[] = [];
    let fg = components(famNodes, joint);
    if (fg.length > 1) {
      const bar = baselineBar(famElements, famBaseline, st);
      if (bar) {
        famConnectors.push(bar);
        const withBar = [...famNodes, makeNode(bar.shape, '', ov)];
        fg = components(withBar, joint);
        famMethod = 'baseline_bar';
        if (fg.length > 1) {
          const res = bridgeGroups(fg.map((g) => ({ shape: union(...g.map((i) => withBar[i].shape)), chars: g.map((i) => withBar[i].chars).join('') })), st.bridge_width_in, st);
          famConnectors.push(...res.bridges);
          famMethod = res.loose.length ? 'failed' : 'bridges';
          if (res.loose.length) failures.push({ code: 'not_one_piece', message: `These letters don't connect: ${res.loose.join(', ')}.`, detail: { loose: res.loose } });
        }
      }
    }
    famConnectors.push(...footC);
    let fam = union(...famNodes.map((nd) => nd.shape), ...famConnectors.map((c) => c.shape));
    const fb = attachBits(fam, famElements.filter((e) => e.kind === 'bit'), design.floatingBits ?? st.floating_bits, st);
    fam = fb.shape;
    famConnectors.push(...fb.connectors);
    // join unless the spine or foot already reaches it
    const joined = components([makeNode(word, '', ov), makeNode(fam, '', ov)], joint).length === 1;
    if (!joined) famConnectors.push(...joinLines(word, fam, st));
    word = union(word, fam, ...famConnectors.map((c) => c.shape));
    allConnectors.push(...famConnectors);
    lines.push({ role: bottom!.role, text: bottom!.text, fontId: bottom!.fontId, letterHeightIn: lineRatio(bottom!, ctx) * s * famC, method: famMethod, tightenPct: 0, engraved: false });
  }

  const topLetter = union(...elements.filter((e) => e.charIndex === glyphs[0]?.charIndex).map((e) => e.shape));
  return { word, connectors: allConnectors, lines, failures, s, topLetter };
}
