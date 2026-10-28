// The spec's test-name matrix: every test name in every enabled font at 24 and
// 36 in (leaners at 46 in tall). Each case must pass, or fail with the outcome
// recorded in expected-outcomes.json. Only these failure codes are acceptable
// for the test names; anything else is an engine bug.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { runEngine } from '@/lib/engine';
import { caseKey, enabledFonts, makeCtx, outcome, TEST_NAMES } from './fixtures';

export const ACCEPTABLE_FAILURES = new Set(['font_not_allowed_for_line', 'letters_too_small', 'thin_section']);
const FILE = path.join(process.cwd(), 'tests', 'engine', 'expected-outcomes.json');

export function runMatrix(names: string[]) {
  const ctx = makeCtx();
  const expected: Record<string, string> = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
  for (const tn of TEST_NAMES.filter((t) => names.includes(t.name))) {
    describe(tn.name, () => {
      for (const f of enabledFonts)
        for (const size of tn.sizes) {
          const key = caseKey(tn.name, f.label, size);
          test(`${f.label} at ${size} in`, () => {
            const r = runEngine(tn.build(f.id, size), ctx);
            const codes = r.failures.map((x) => x.code);
            for (const c of codes) expect(ACCEPTABLE_FAILURES, `${key}: unexpected failure ${c}`).toContain(c);
            for (const x of r.failures) expect(x.message.length).toBeGreaterThan(10);
            if (r.ok) {
              expect(r.report.pieceCount).toBe(1);
              const target = tn.build(f.id, size);
              if (target.layout === 'vertical') expect(r.heightIn).toBeCloseTo(size, 2);
              else expect(r.widthIn).toBeCloseTo(size, 2);
            }
            expect(outcome(codes), key).toBe(expected[key] ?? 'pass');
          });
        }
    });
  }
}
