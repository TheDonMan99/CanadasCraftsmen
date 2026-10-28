// Re-record tests/engine/expected-outcomes.json after an intended engine or
// catalog change. Review the diff before committing: every change in outcome
// should be explainable.
//   npx tsx scripts/update-expected-outcomes.ts
import fs from 'node:fs';
import { runEngine } from '@/lib/engine';
import { caseKey, enabledFonts, makeCtx, outcome, TEST_NAMES } from '@/tests/engine/fixtures';

const ctx = makeCtx();
const out: Record<string, string> = {};
for (const tn of TEST_NAMES)
  for (const f of enabledFonts)
    for (const size of tn.sizes) {
      const r = runEngine(tn.build(f.id, size), ctx);
      const o = outcome(r.failures.map((x) => x.code));
      if (o !== 'pass') out[caseKey(tn.name, f.label, size)] = o;
    }
fs.writeFileSync('tests/engine/expected-outcomes.json', JSON.stringify(out, null, 2) + '\n');
console.log(Object.keys(out).length, 'expected failures recorded');
