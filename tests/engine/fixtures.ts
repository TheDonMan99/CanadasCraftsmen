// Shared engine context and the spec's test names for the automated suite.
import { byCategory, engineSettings, largestSign, materialSpec, seedCatalog, seedSettings, sizeRules } from '@/lib/config/catalog';
import { engineFonts } from '@/lib/server/fonts';
import type { Design, EngineContext, LineRole } from '@/lib/engine/types';

export const catalog = seedCatalog();
export const settings = seedSettings();
const fonts = engineFonts(catalog);

export function makeCtx(materialId = 'material.birch-6mm'): EngineContext {
  const mat = catalog.find((o) => o.id === materialId)!;
  return { fonts, material: materialSpec(mat), settings: engineSettings(settings), sizes: sizeRules(settings), largestSignIn: largestSign(settings) };
}

export const enabledFonts = byCategory(catalog, 'font').map((o) => ({ id: o.id, label: o.label, lines: o.values.allowed_lines as LineRole[] }));

/** Block font used for a line the font under test isn't offered on. */
export const FALLBACK_SMALL_FONT = 'font.montserrat-bold';

export interface TestName {
  name: string;
  build: (fontId: string, sizeIn: number) => Design;
  sizes: number[];
}

const single = (text: string): TestName['build'] => (fontId, w) => ({ layout: 'horizontal', style: 'one_piece', widthIn: w, lines: [{ role: 'main', text, fontId }] });

export const TEST_NAMES: TestName[] = [
  { name: 'Ava', build: single('Ava'), sizes: [24, 36] },
  { name: 'Liam', build: single('Liam'), sizes: [24, 36] },
  { name: 'Olivia', build: single('Olivia'), sizes: [24, 36] },
  { name: 'Zoë', build: single('Zoë'), sizes: [24, 36] },
  { name: "O'Brien", build: single("O'Brien"), sizes: [24, 36] },
  { name: 'Jojo', build: single('Jojo'), sizes: [24, 36] },
  { name: 'The Smith Family', build: single('The Smith Family'), sizes: [24, 36] },
  {
    name: 'Welcome + Est. 2019',
    sizes: [24, 36],
    build: (fontId, w) => {
      const f = enabledFonts.find((x) => x.id === fontId)!;
      return {
        layout: 'horizontal', style: 'one_piece', widthIn: w,
        lines: [
          { role: 'main', text: 'Welcome', fontId },
          { role: 'small', text: 'Est. 2019', fontId: f.lines.includes('small') ? fontId : FALLBACK_SMALL_FONT },
        ],
      };
    },
  },
  { name: '20-character main name', build: single('Montgomery Fairbanks'), sizes: [24, 36] },
  { name: 'All-capitals block name', build: single('THE JOHNSONS'), sizes: [24, 36] },
  { name: 'Leaner WELCOME', sizes: [46], build: (fontId, h) => ({ layout: 'vertical', style: 'one_piece', heightIn: h, lines: [{ role: 'main', text: 'WELCOME', fontId }] }) },
  { name: 'Leaner HOME', sizes: [46], build: (fontId, h) => ({ layout: 'vertical', style: 'one_piece', heightIn: h, lines: [{ role: 'main', text: 'HOME', fontId }] }) },
];

export const caseKey = (name: string, font: string, size: number) => `${name} | ${font} | ${size}`;
export const outcome = (codes: string[]) => (codes.length ? [...new Set(codes)].sort().join(',') : 'pass');
