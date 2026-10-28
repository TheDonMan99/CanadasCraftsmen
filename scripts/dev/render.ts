// Dev helper: render a design to preview PNG + cut SVG in test-output/.
import fs from 'node:fs';
import { seedCatalog, seedSettings, byCategory, materialSpec, engineSettings, sizeRules, largestSign } from '@/lib/config/catalog';
import { engineFonts } from '@/lib/server/fonts';
import { runEngine, type Design } from '@/lib/engine';
import { previewSvg, cutFileSvg } from '@/lib/export';
import { svgToPng } from '@/lib/export/png';

const cat = seedCatalog(), st = seedSettings();
const ctx = { fonts: engineFonts(cat), material: materialSpec(byCategory(cat, 'material')[0]), settings: engineSettings(st), sizes: sizeRules(st), largestSignIn: largestSign(st) };
const design: Design = JSON.parse(process.argv[2]);
const name = process.argv[3] ?? 'out';
const t = Date.now();
const r = runEngine(design, ctx);
console.log(Date.now() - t, 'ms', r.ok, r.failures.map((f) => `${f.code}: ${f.message}`), r.warnings.map((w) => w.message), r.report.lines.map((l) => `${l.text}:${l.method}:${l.tightenPct}%:${l.letterHeightIn.toFixed(2)}`), `${r.widthIn.toFixed(2)}x${r.heightIn.toFixed(2)}`, 'pieces', r.report.pieceCount, 'thinnest', r.report.thinnest?.widthIn.toFixed(3));
fs.mkdirSync('test-output', { recursive: true });
fs.writeFileSync(`test-output/${name}.png`, svgToPng(previewSvg(r, { colours: { top: '#F5F5F2', outline: '#1E1E1E', letters: '#1E1E1E', backer: '#E3C9A0' }, background: 'plain', showDimensions: true, showThin: true }), 1400));
fs.writeFileSync(`test-output/${name}.svg`, cutFileSvg(r, { export: st.export as any, materialName: ctx.material.lightburnName, label: 'LAB', maxRowWidthIn: 47, spacingIn: 0.25, marginIn: 0.25 }));
