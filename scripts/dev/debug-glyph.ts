import { makeCtx } from '@/tests/engine/fixtures';
import { area } from '@/lib/engine/geom';
const ctx = makeCtx();
const [font, chars] = process.argv.slice(2);
for (const ch of chars) {
  const g = ctx.fonts[font].font.glyph(ch);
  console.log(ch, 'bodies', g.bodies.map((b) => area(b).toFixed(0)), 'bits', g.bits.map((b) => area(b).toFixed(0)));
}
