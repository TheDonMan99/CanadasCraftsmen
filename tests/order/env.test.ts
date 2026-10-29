// Keys pasted into Vercel with stray spaces, line breaks or quotes still work.
import { expect, test } from 'vitest';
import { cleanKey } from '@/lib/server/env';

test('cleanKey', () => {
  expect(cleanKey(' 0x4AAAAAAAB12 \n')).toBe('0x4AAAAAAAB12');
  expect(cleanKey('"0x4AAAAAAAB12"')).toBe('0x4AAAAAAAB12');
  expect(cleanKey("'re_abc'")).toBe('re_abc');
  expect(cleanKey('  ')).toBeNull();
  expect(cleanKey(undefined)).toBeNull();
});
