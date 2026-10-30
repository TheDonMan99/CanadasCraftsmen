// LightBurn export rules: true-size inches, layer colours, closed paths, file names.
import { describe, expect, test } from 'vitest';
import { runEngine } from '@/lib/engine';
import { calibrationSvg, cutFileSvg, cutLayerDxf, orderFileName, panelFileName, previewSvg, type ExportSettings } from '@/lib/export';
import { svgToPng } from '@/lib/export/png';
import { makeCtx, settings } from './fixtures';

const ctx = makeCtx();
const ex = settings.export as ExportSettings;
const opts = { export: ex, materialName: ctx.material.lightburnName, label: 'S-1042', maxRowWidthIn: 47, spacingIn: 0.25, marginIn: 0.25 };
const sign = runEngine({ layout: 'horizontal', style: 'one_piece', widthIn: 36, lines: [{ role: 'main', text: 'Welcome', fontId: 'font.pacifico' }] }, ctx);
const backer = runEngine({ layout: 'horizontal', style: 'letters_on_backer', widthIn: 24, backer: { shape: 'plank' }, lines: [{ role: 'main', text: 'Smith', fontId: 'font.bebas-neue' }, { role: 'small', text: 'Est. 2019', fontId: 'font.montserrat-bold', engraved: true }] }, ctx);

const svgSize = (svg: string) => {
  const m = svg.match(/width="([\d.]+)in" height="([\d.]+)in" viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
  return { w: +m[1], h: +m[2], vw: +m[3], vh: +m[4] };
};

describe('LightBurn SVG', () => {
  test('calibration square: a 10.000 in square on the cut layer, document in inches', () => {
    const svg = calibrationSvg(ex);
    const s = svgSize(svg);
    expect(s.w).toBe(s.vw);
    expect(s.h).toBe(s.vh);
    const d = svg.match(/<g id="cut"[^>]*stroke="#FF0000"[^>]*><path d="([^"]+)"/)![1];
    const nums = d.match(/[\d.]+/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(10);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(10);
  });
  test('width and height are inches with a matching viewBox (1 unit = 1 in)', () => {
    const s = svgSize(cutFileSvg(sign, opts));
    expect(s.w).toBe(s.vw);
    expect(s.h).toBe(s.vh);
    expect(s.w).toBeGreaterThan(36);
    expect(s.w).toBeLessThan(37);
  });
  test('layers use the LightBurn palette; cut and score are unfilled strokes, engrave is filled', () => {
    const svg = cutFileSvg(backer, opts);
    expect(svg).toMatch(/<g id="cut"[^>]*fill="none" stroke="#FF0000"/);
    expect(svg).toMatch(/<g id="score"[^>]*fill="none" stroke="#0000FF"/);
    expect(svg).toMatch(/<g id="engrave"[^>]*fill="#000000" stroke="none"/);
    expect(svg).toMatch(/<g id="labels"[^>]*fill="#00E000"/);
    expect(svg).toContain('Birch plywood 1/4 in');
  });
  test('every cut path is closed', () => {
    const d = cutFileSvg(sign, opts).match(/<g id="cut"[^>]*><path d="([^"]+)"/)![1];
    const subpaths = d.split('M').filter(Boolean);
    expect(subpaths.length).toBeGreaterThan(1);
    for (const p of subpaths) expect(p.endsWith('Z')).toBe(true);
  });
  test('letters and backer are laid out apart for cutting', () => {
    const svg = cutFileSvg(backer, opts);
    const s = svgSize(svg);
    expect(s.h).toBeGreaterThan(backer.heightIn + 1);
  });
  test('customer text is escaped in labels', () => {
    const svg = cutFileSvg(sign, { ...opts, label: '<script>&"' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;&amp;&quot;');
  });
});

describe('other formats and names', () => {
  test('DXF of the cut layer in inches', () => {
    const dxf = cutLayerDxf(sign.parts[0].cut);
    expect(dxf).toContain('$INSUNITS\n70\n1');
    expect(dxf.match(/POLYLINE/g)!.length).toBe(sign.parts[0].cut.length);
    expect(dxf.trim().endsWith('EOF')).toBe(true);
  });
  test('preview SVG has a size label and renders to PNG', () => {
    const svg = previewSvg(sign, { colours: { word: '#F5F5F2' }, background: 'wall', showDimensions: true, showThin: true });
    expect(svg).toContain('36.00 in ×');
    const png = svgToPng(svg, 400);
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
  test('file names follow the spec', () => {
    expect(orderFileName('S-1042', 'Smith', 36, 'Birch-6mm')).toBe('S-1042_Smith_36in_Birch-6mm.svg');
    expect(orderFileName('S-1043', "O'Brien-Zoë", 24, 'Maple-6mm')).toBe('S-1043_OBrien-Zoe_24in_Maple-6mm.svg');
    expect(panelFileName('2026-11-03', 'Birch-6mm', 1, 'A')).toBe('2026-11-03_Birch-6mm_Sheet1_PanelA.svg');
  });
});

describe('preview backgrounds', () => {
  const opt = { colours: { word: '#F5F5F2' }, background: 'plain' as const, showDimensions: true, showThin: false };
  const shapes = (svg: string) => svg.match(/<path d="[^"]+" fill="#F5F5F2"/g);
  test('a chosen background colour fills the mock-up; the sign itself is unchanged', () => {
    const plain = previewSvg(sign, opt);
    const navy = previewSvg(sign, { ...opt, backdrop: { hex: '#1F2A44' } });
    expect(plain).toContain('<rect width="100%" height="100%" fill="#FFFFFF"/>');
    expect(navy).toContain('<rect width="100%" height="100%" fill="#1F2A44"/>');
    expect(shapes(navy)).toEqual(shapes(plain));
  });
  test('the size label turns light on a dark background; siding adds board lines', () => {
    expect(previewSvg(sign, { ...opt, backdrop: { hex: '#2E2F31' } })).toContain('fill="#EEEEEE">36.00 in');
    expect(previewSvg(sign, { ...opt, backdrop: { hex: '#D8D2C8' } })).toContain('fill="#444444">36.00 in');
    expect(previewSvg(sign, { ...opt, backdrop: { hex: '#D8D2C8', siding: true } })).toContain('rgba(0,0,0,0.08)');
  });
  test('a malformed colour falls back to white', () => {
    expect(previewSvg(sign, { ...opt, backdrop: { hex: 'red"/><script>' } })).toContain('fill="#FFFFFF"/>');
  });
});
