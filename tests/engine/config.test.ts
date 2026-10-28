// The seed catalog and settings carry every value the engine needs.
import { describe, expect, test } from 'vitest';
import { byCategory, largestSign } from '@/lib/config/catalog';
import { catalog, settings } from './fixtures';
import fs from 'node:fs';

describe('seed catalog', () => {
  test('ships 14 fonts, 11 on, each with its licence file', () => {
    const fonts = byCategory(catalog, 'font', false);
    expect(fonts).toHaveLength(14);
    expect(fonts.filter((f) => f.enabled)).toHaveLength(11);
    for (const f of fonts) {
      expect(fs.existsSync(`public/fonts/${f.values.font_file}`)).toBe(true);
      expect(fs.existsSync(`public/fonts/${f.values.licence_file}`)).toBe(true);
      expect(f.values.licence_confirmed).toBe(true);
    }
  });
  test('four construction styles, two materials on', () => {
    expect(byCategory(catalog, 'style')).toHaveLength(4);
    expect(byCategory(catalog, 'material').map((m) => m.id)).toEqual(['material.birch-6mm', 'material.maple-6mm']);
  });
  test('ids are unique', () => {
    const ids = catalog.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  test('largest sign is 46 in from a 48 x 47.875 in panel with 0.5 in margins', () => {
    expect(largestSign(settings)).toBe(46);
  });
});
