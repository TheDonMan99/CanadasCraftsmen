import { expect, test } from 'vitest';
import { seedCatalog } from '@/lib/config/catalog';
import { publicCatalog } from '@/lib/server/public-catalog';

test('the public catalog has enabled options only, without internal notes or costs', () => {
  const pub = publicCatalog(seedCatalog());
  expect(pub.every((o) => o.enabled)).toBe(true);
  expect(seedCatalog().some((o) => o.internal_notes)).toBe(true);
  expect(pub.every((o) => o.internal_notes === '')).toBe(true);
  expect(pub.find((o) => o.id === 'material.birch-6mm')!.values.sheet_cost_cents).toBeUndefined();
  expect(pub.find((o) => o.id === 'style.layered')).toBeUndefined();
});
