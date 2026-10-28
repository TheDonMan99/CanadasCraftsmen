// Dev helper: run one design through the engine and print the report.
import { seedCatalog, seedSettings, byCategory, materialSpec, engineSettings, sizeRules, largestSign } from '@/lib/config/catalog';
import { engineFonts } from '@/lib/server/fonts';
import { runEngine } from '@/lib/engine';

const cat = seedCatalog(), st = seedSettings();
const ctx = { fonts: engineFonts(cat), material: materialSpec(byCategory(cat, 'material')[0]), settings: engineSettings(st), sizes: sizeRules(st), largestSignIn: largestSign(st) };
const [text = 'Welcome', font = 'font.pacifico', width = '36', style = 'one_piece'] = process.argv.slice(2);
const t = Date.now();
const r = runEngine({ layout: 'horizontal', style: style as any, widthIn: +width, lines: [{ role: 'main', text, fontId: font }], keyholes: true }, ctx);
console.log(Date.now() - t, 'ms', JSON.stringify({ ok: r.ok, failures: r.failures.map((f) => f.message), warnings: r.warnings.map((w) => w.message), report: { ...r.report, lines: r.report.lines } }, null, 1));
