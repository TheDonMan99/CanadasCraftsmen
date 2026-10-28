// Dev helper: check each shipped font parses and has the characters the test names need.
import * as opentype from 'opentype.js';
import fs from 'fs';
const dir = process.argv[2] ?? 'public/fonts';
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ttf'))) {
  const buf = fs.readFileSync(dir + '/' + f);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const miss = [...'ëéÉ’\'aZ09.'].filter(c => !font.hasChar(c)).join('');
  let x = 0, cmds = 0;
  for (const ch of 'Zoë') { const g = font.charToGlyph(ch); cmds += g.getPath(x, 0, 72).commands.length; x += g.advanceWidth * 72 / font.unitsPerEm; }
  console.log(f.padEnd(28), 'upm', font.unitsPerEm, 'missing:', miss || '-', 'cmds', cmds, 'kern?', !!(font.kerningPairs && Object.keys(font.kerningPairs).length) || !!font.tables.gpos);
}
