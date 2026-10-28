// Dev helper: run every test name in every enabled font and print outcomes.
import { runEngine } from '@/lib/engine';
import { makeCtx, enabledFonts, TEST_NAMES } from '@/tests/engine/fixtures';
const ctx = makeCtx();
const t0 = Date.now();
for (const tn of TEST_NAMES) for (const f of enabledFonts) for (const sz of tn.sizes) {
  const t = Date.now();
  const r = runEngine(tn.build(f.id, sz), ctx);
  console.log([tn.name, f.label, sz, Date.now() - t + 'ms', r.ok ? 'PASS' : 'FAIL ' + [...new Set(r.failures.map((x) => x.code))].join(','), r.report.lines.map((l) => l.method + (l.tightenPct ? l.tightenPct + '%' : '')).join('/'), `${r.widthIn.toFixed(1)}x${r.heightIn.toFixed(1)}`, 'thin', r.report.thinnest?.widthIn.toFixed(3)].join(' | '));
}
console.log('total', Date.now() - t0, 'ms');
