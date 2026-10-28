'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { byCategory, seedCatalog, seedSettings } from '@/lib/config/catalog';
import type { ContextOverrides } from '@/lib/config/context';
import type { BackerShapeKey, Design, DesignLine, EngineResult, EngineSettings, FloatingBits, LineRole, StyleKey } from '@/lib/engine/types';
import { previewSvg } from '@/lib/export/svg';

const catalog = seedCatalog();
const settings = seedSettings();
const fonts = byCategory(catalog, 'font', false);
const materials = byCategory(catalog, 'material', false);
const widths = byCategory(catalog, 'size').filter((s) => s.values.kind === 'width').map((s) => s.values.width_in as number);
const heights = byCategory(catalog, 'size').filter((s) => s.values.kind === 'height').map((s) => s.values.height_in as number);
const paints = byCategory(catalog, 'paint', false);

const STYLES: { key: StyleKey; label: string }[] = [
  { key: 'one_piece', label: 'One-piece word' },
  { key: 'layered', label: 'Layered two-tone' },
  { key: 'letters_on_backer', label: 'Letters on backer' },
  { key: 'stencil', label: 'Stencil panel' },
];
const BACKERS: BackerShapeKey[] = ['rectangle', 'rounded_rectangle', 'plank', 'arch_top', 'oval', 'circle'];

type Preset = { name: string; layout: Design['layout']; lines: DesignLine[]; size: number };
const P = (role: LineRole, text: string, fontId = 'font.pacifico'): DesignLine => ({ role, text, fontId });
const PRESETS: Preset[] = [
  { name: 'Ava', layout: 'horizontal', size: 24, lines: [P('main', 'Ava')] },
  { name: 'Liam', layout: 'horizontal', size: 24, lines: [P('main', 'Liam')] },
  { name: 'Olivia', layout: 'horizontal', size: 24, lines: [P('main', 'Olivia')] },
  { name: 'Zoë', layout: 'horizontal', size: 24, lines: [P('main', 'Zoë')] },
  { name: "O'Brien", layout: 'horizontal', size: 24, lines: [P('main', "O'Brien")] },
  { name: 'Jojo', layout: 'horizontal', size: 24, lines: [P('main', 'Jojo')] },
  { name: 'The Smith Family', layout: 'horizontal', size: 36, lines: [P('main', 'The Smith Family')] },
  { name: 'Welcome + Est. 2019', layout: 'horizontal', size: 36, lines: [P('main', 'Welcome'), P('small', 'Est. 2019', 'font.montserrat-bold')] },
  { name: '20-character name', layout: 'horizontal', size: 36, lines: [P('main', 'Montgomery Fairbanks')] },
  { name: 'All-capitals block name', layout: 'horizontal', size: 36, lines: [P('main', 'THE JOHNSONS', 'font.bebas-neue')] },
  { name: 'Leaner WELCOME', layout: 'vertical', size: 46, lines: [P('main', 'WELCOME', 'font.bebas-neue')] },
  { name: 'Leaner HOME', layout: 'vertical', size: 46, lines: [P('main', 'HOME')] },
  { name: '36 in Welcome (test cut)', layout: 'horizontal', size: 36, lines: [P('main', 'Welcome')] },
];

const ENGINE_KEYS = Object.keys(settings.engine).filter((k) => typeof (settings.engine as any)[k] === 'number') as (keyof EngineSettings)[];
const label = (k: string) => k.replace(/_in$/, ' (in)').replace(/_pct$/, ' (%)').replace(/_/g, ' ');

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export default function LabClient() {
  const [layout, setLayout] = useState<Design['layout']>('horizontal');
  const [lines, setLines] = useState<DesignLine[]>([P('main', 'Welcome')]);
  const [widthIn, setWidthIn] = useState(36);
  const [heightIn, setHeightIn] = useState(46);
  const [style, setStyle] = useState<StyleKey>('one_piece');
  const [backer, setBacker] = useState<BackerShapeKey>('rectangle');
  const [padding, setPadding] = useState(settings.engine.backer_padding_in);
  const [bits, setBits] = useState<FloatingBits>(settings.engine.floating_bits as FloatingBits);
  const [keyholes, setKeyholes] = useState(false);
  const [foot, setFoot] = useState(settings.engine.leaner_foot);
  const [materialId, setMaterialId] = useState(materials[0].id);
  const [kerf, setKerf] = useState<number | ''>('');
  const [minFeature, setMinFeature] = useState<number | ''>('');
  const [engine, setEngine] = useState<Partial<EngineSettings>>({});
  const [showDisabled, setShowDisabled] = useState(true);
  const [colours, setColours] = useState({ word: '#E3C9A0', top: '#F5F5F2', outline: '#1E1E1E', letters: '#1E1E1E', backer: '#E3C9A0', panel: '#E3C9A0' });
  const [background, setBackground] = useState<'plain' | 'wall'>('plain');
  const [showCut, setShowCut] = useState(false);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [ms, setMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);

  const design: Design = useMemo(
    () => ({
      layout,
      style: layout === 'vertical' && !['one_piece', 'layered'].includes(style) ? 'one_piece' : style,
      widthIn: layout === 'horizontal' ? widthIn : undefined,
      heightIn: layout === 'vertical' ? heightIn : undefined,
      lines,
      backer: { shape: backer, paddingIn: padding },
      floatingBits: bits,
      keyholes,
      leanerFoot: foot,
    }),
    [layout, style, widthIn, heightIn, lines, backer, padding, bits, keyholes, foot],
  );
  const overrides: ContextOverrides = useMemo(
    () => ({ engine, material: { ...(kerf !== '' ? { kerfIn: kerf } : {}), ...(minFeature !== '' ? { minFeatureIn: minFeature } : {}) } }),
    [engine, kerf, minFeature],
  );

  useEffect(() => {
    const w = new Worker(new URL('./engine.worker.ts', import.meta.url));
    w.onmessage = (e) => {
      if (e.data.id !== seq.current) return;
      setBusy(false);
      if (e.data.error) setError(e.data.error);
      else {
        setError('');
        setResult(e.data.result);
        setMs(e.data.ms);
      }
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      seq.current += 1;
      setBusy(true);
      worker.current?.postMessage({ id: seq.current, design, materialId, overrides });
    }, 250);
    return () => clearTimeout(t);
  }, [design, materialId, overrides]);

  const preview = useMemo(
    () => (result && result.parts.length ? previewSvg(result, { colours, background, showDimensions: true, showThin: true, showCutPaths: showCut }) : ''),
    [result, colours, background, showCut],
  );

  async function serverFile(format: 'svg' | 'png' | 'dxf') {
    const res = await fetch('/api/lab/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design, materialId, overrides, colours, format }) });
    if (!res.ok) return setError(`Download failed: ${res.status}`);
    const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `lab.${format}`;
    download(name, await res.blob());
  }

  const setLine = (i: number, patch: Partial<DesignLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const fontChoices = fonts.filter((f) => showDisabled || f.enabled);
  const usesBacker = style === 'letters_on_backer' || style === 'stencil';
  const r = result?.report;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Engine lab</h1>
          <p className="text-sm text-stone-600">Type text, switch fonts and settings, and download test files. Nothing here is saved.</p>
        </div>
        <a href="/api/lab/calibration" className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-100">
          Download 10 in calibration square
        </a>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <Section title="Test names">
            <select className="input" value="" onChange={(e) => {
              const p = PRESETS.find((x) => x.name === e.target.value);
              if (!p) return;
              setLayout(p.layout);
              setLines(p.lines.map((l) => ({ ...l })));
              if (p.layout === 'vertical') setHeightIn(p.size);
              else setWidthIn(p.size);
            }}>
              <option value="">Load a test name…</option>
              {PRESETS.map((p) => <option key={p.name}>{p.name}</option>)}
            </select>
          </Section>

          <Section title="Text">
            {lines.map((l, i) => (
              <div key={i} className="space-y-1 rounded-md border border-stone-200 p-2">
                <div className="flex gap-2">
                  <select className="input w-24" value={l.role} onChange={(e) => setLine(i, { role: e.target.value as LineRole })}>
                    <option value="top">Top</option>
                    <option value="main">Main</option>
                    <option value="small">Small</option>
                  </select>
                  <input className="input flex-1" value={l.text} onChange={(e) => setLine(i, { text: e.target.value })} />
                  {lines.length > 1 && <button className="px-2 text-stone-500" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove line">×</button>}
                </div>
                <div className="flex items-center gap-2">
                  <select className="input flex-1" value={l.fontId} onChange={(e) => setLine(i, { fontId: e.target.value })}>
                    {fontChoices.map((f) => <option key={f.id} value={f.id}>{f.label}{f.enabled ? '' : ' (off)'}</option>)}
                  </select>
                  {l.role === 'small' && (
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!l.engraved} onChange={(e) => setLine(i, { engraved: e.target.checked })} /> Engrave</label>
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between">
              {lines.length < 3 && <button className="text-sm text-blue-700" onClick={() => setLines((ls) => [...ls, P('small', 'Est. 2019', 'font.montserrat-bold')])}>+ Add line</button>}
              <label className="flex items-center gap-1 text-xs text-stone-600"><input type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} /> Show fonts that are off</label>
            </div>
          </Section>

          <Section title="Size and style">
            <div className="flex gap-2">
              {(['horizontal', 'vertical'] as const).map((v) => (
                <button key={v} onClick={() => setLayout(v)} className={`flex-1 rounded-md border px-2 py-1 text-sm ${layout === v ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white'}`}>
                  {v === 'horizontal' ? 'Horizontal' : 'Porch leaner'}
                </button>
              ))}
            </div>
            {layout === 'horizontal' ? (
              <div>
                <div className="flex flex-wrap gap-1">
                  {widths.map((w) => <button key={w} onClick={() => setWidthIn(w)} className={`rounded border px-2 py-0.5 text-xs ${widthIn === w ? 'border-stone-900 bg-stone-200' : 'border-stone-300'}`}>{w} in</button>)}
                </div>
                <Num label="Width (in)" value={widthIn} step={0.5} onChange={setWidthIn} />
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {heights.map((h) => <button key={h} onClick={() => setHeightIn(h)} className={`rounded border px-2 py-0.5 text-xs ${heightIn === h ? 'border-stone-900 bg-stone-200' : 'border-stone-300'}`}>{h} in tall</button>)}
                <label className="mt-1 flex items-center gap-1 text-xs"><input type="checkbox" checked={foot} onChange={(e) => setFoot(e.target.checked)} /> Flat base foot</label>
              </div>
            )}
            <select className="input" value={style} onChange={(e) => setStyle(e.target.value as StyleKey)}>
              {STYLES.filter((s) => layout === 'horizontal' || s.key === 'one_piece' || s.key === 'layered').map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            {usesBacker && layout === 'horizontal' && (
              <div className="flex gap-2">
                <select className="input flex-1" value={backer} onChange={(e) => setBacker(e.target.value as BackerShapeKey)}>
                  {BACKERS.map((b) => <option key={b} value={b}>{b.replace('_', ' ')}</option>)}
                </select>
                <Num label="Padding" value={padding} step={0.25} onChange={setPadding} />
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1"><input type="checkbox" checked={keyholes} onChange={(e) => setKeyholes(e.target.checked)} /> Keyhole slots</label>
              <select className="input flex-1" value={bits} onChange={(e) => setBits(e.target.value as FloatingBits)}>
                <option value="bridge">Dots: bridge</option>
                <option value="merge">Dots: merge</option>
                <option value="remove">Dots: remove</option>
              </select>
            </div>
          </Section>

          <Section title="Material">
            <select className="input" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.label}{m.enabled ? '' : ' (off)'}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Num label={`Kerf (default ${materials.find((m) => m.id === materialId)?.values.kerf_in})`} value={kerf} step={0.001} onChange={setKerf} allowEmpty />
              <Num label={`Min feature (default ${materials.find((m) => m.id === materialId)?.values.min_feature_in})`} value={minFeature} step={0.01} onChange={setMinFeature} allowEmpty />
            </div>
          </Section>

          <details className="rounded-lg border border-stone-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-medium">Engine settings</summary>
            <p className="mt-1 text-xs text-stone-500">Changes here apply to this page only. Saved values live in Settings → Engine from phase 2.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ENGINE_KEYS.map((k) => (
                <Num key={k} label={label(k)} value={(engine[k] as number | undefined) ?? (settings.engine as any)[k]} step={0.01} onChange={(v) => setEngine((e) => ({ ...e, [k]: v }))} />
              ))}
            </div>
            <button className="mt-2 text-xs text-blue-700" onClick={() => setEngine({})}>Reset to defaults</button>
          </details>
        </aside>

        <main className="space-y-4">
          <div className="rounded-lg border border-stone-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${!result ? 'bg-stone-200' : result.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {!result ? 'Working…' : result.ok ? 'Passes' : 'Fails'}
              </span>
              <span className="text-stone-500">{busy ? 'Recalculating…' : `${ms} ms`}</span>
              <label className="flex items-center gap-1"><input type="checkbox" checked={background === 'wall'} onChange={(e) => setBackground(e.target.checked ? 'wall' : 'plain')} /> Wall background</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={showCut} onChange={(e) => setShowCut(e.target.checked)} /> Show kerf toolpaths</label>
              <span className="flex flex-wrap items-center gap-1">
                {(result?.parts ?? []).map((p) => p.colourPiece).filter((c, i, a) => a.indexOf(c) === i).map((c) => (
                  <label key={c} className="flex items-center gap-1 text-xs">
                    {c}
                    <select className="rounded border border-stone-300 text-xs" value={colours[c as keyof typeof colours]} onChange={(e) => setColours((cs) => ({ ...cs, [c]: e.target.value }))}>
                      <option value="#E3C9A0">Raw birch</option>
                      {paints.map((p) => <option key={p.id} value={p.values.hex}>{p.label}</option>)}
                    </select>
                  </label>
                ))}
              </span>
            </div>
            {preview ? <div className="w-full [&>svg]:h-auto [&>svg]:max-h-[70vh] [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: preview }} /> : <div className="py-20 text-center text-stone-400">No preview</div>}
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn" onClick={() => serverFile('svg')}>Download SVG (LightBurn)</button>
              <button className="btn" onClick={() => serverFile('png')}>Download PNG preview</button>
              {settings.export.dxf_enabled && <button className="btn" onClick={() => serverFile('dxf')}>Download DXF (cut layer)</button>}
            </div>
          </div>

          {result && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
                <h2 className="mb-2 font-medium">Checks</h2>
                {result.failures.length === 0 && <p className="text-green-800">All checks pass.</p>}
                <ul className="space-y-1">
                  {result.failures.map((f, i) => <li key={i} className="text-red-800">✗ {f.message}</li>)}
                  {result.warnings.map((w, i) => <li key={i} className="text-amber-800">! {w.message}</li>)}
                </ul>
                <h3 className="mt-3 font-medium">Lines</h3>
                <table className="w-full text-xs">
                  <tbody>
                    {r!.lines.map((l, i) => (
                      <tr key={i} className="border-t border-stone-100">
                        <td className="py-1">{l.role}</td>
                        <td>{l.text}</td>
                        <td>{l.letterHeightIn.toFixed(2)} in</td>
                        <td>{l.method}{l.tightenPct ? ` ${l.tightenPct}%` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
                <h2 className="mb-2 font-medium">Report</h2>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt>Size</dt><dd>{r!.widthIn.toFixed(3)} × {r!.heightIn.toFixed(3)} in</dd>
                  <dt>Pieces</dt><dd>{r!.pieceCount} (expected {r!.expectedPieces})</dd>
                  <dt>Thinnest section</dt><dd>{r!.thinnest ? `${r!.thinnest.widthIn.toFixed(3)} in (${(r!.thinnest.widthIn * 25.4).toFixed(1)} mm) at ${r!.thinnest.x.toFixed(1)}, ${r!.thinnest.y.toFixed(1)}` : '—'}</dd>
                  <dt>Cut path</dt><dd>{r!.cutLengthIn.toFixed(1)} in</dd>
                  <dt>Score path</dt><dd>{r!.scoreLengthIn.toFixed(1)} in</dd>
                  <dt>Engrave area</dt><dd>{r!.engraveAreaIn2.toFixed(1)} in²</dd>
                  <dt>Part area</dt><dd>{r!.partAreaIn2.toFixed(1)} in²</dd>
                  <dt>Laser time (est.)</dt><dd>{r!.laserMinutes.toFixed(1)} min</dd>
                  <dt>Bridges</dt><dd>{r!.bridges}</dd>
                  <dt>Keyholes</dt><dd>{r!.keyholes.length}</dd>
                </dl>
                <h3 className="mt-3 font-medium">Pieces</h3>
                <ul className="text-xs">
                  {r!.pieces.map((p) => <li key={p.id}>{p.name} — {p.widthIn.toFixed(2)} × {p.heightIn.toFixed(2)} in</li>)}
                </ul>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-stone-200 bg-white p-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Num<T extends number | ''>({ label, value, step, onChange, allowEmpty }: { label: string; value: T; step: number; onChange: (v: T) => void; allowEmpty?: boolean }) {
  return (
    <label className="block text-xs text-stone-600">
      {label}
      <input
        type="number"
        className="input mt-0.5"
        value={value}
        step={step}
        onChange={(e) => onChange((e.target.value === '' ? (allowEmpty ? '' : 0) : Number(e.target.value)) as T)}
      />
    </label>
  );
}
