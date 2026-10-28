import { seedCatalog, seedSettings, byCategory, materialSpec, engineSettings, sizeRules, largestSign } from '@/lib/config/catalog';
import { engineFonts } from '@/lib/server/fonts';
import { layoutLine, stackLines } from '@/lib/engine/layout';
import { attachBits } from '@/lib/engine/connect';
import { bounds, union, area, pieces } from '@/lib/engine/geom';
const cat = seedCatalog(), st = seedSettings();
const ctx: any = { fonts: engineFonts(cat), material: materialSpec(byCategory(cat, 'material')[0]), settings: engineSettings(st), sizes: sizeRules(st), largestSignIn: largestSign(st) };
const [text, font] = process.argv.slice(2);
const l = layoutLine({ role: 'main', text, fontId: font }, 0, ctx, 0);
const [pl] = stackLines([l], 5, ctx);
for (const e of pl.elements) console.log(e.kind, e.char, JSON.stringify(bounds(e.shape)), area(e.shape).toFixed(3));
const base = union(...pl.elements.filter(e => e.kind === 'body').map(e => e.shape));
const r = attachBits(base, pl.elements.filter(e => e.kind === 'bit'), 'bridge', ctx.settings);
for (const c of r.connectors) console.log('conn', JSON.stringify(c.a), JSON.stringify(c.b), JSON.stringify(bounds(c.shape)));
console.log('pieces before', pieces(base).length, 'after', pieces(r.shape).length);
{
  const bits = pl.elements.filter(e => e.kind === 'bit');
  let s1 = union(base, bits[0].shape);
  console.log('base+bit0', pieces(s1).length, 'paths', s1.length);
  const r1 = attachBits(base, [bits[0]], 'bridge', ctx.settings);
  console.log('attach bit0', pieces(r1.shape).length, r1.shape.length, r1.shape.map(p => p.length + ':' + area([p]).toFixed(3)).join(' '));
  console.log('bar', JSON.stringify(r1.connectors[0].shape));
}
