'use client';

// The nest layout: one drawing per panel or offcut. On a planned job you can drag
// a part to adjust it (it snaps to 1/8 in), then save; the server checks it's
// inside the panel and clear of the other parts.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { NestJob } from '@/lib/db/nesting';
import type { BinLayout } from '@/lib/nesting/pack';
import { markCut, removeJob, rerun, saveAdjusted } from '../actions';

const PALETTE = ['#F2C48D', '#A7C7E7', '#C1E1C1', '#F4B6C2', '#D7BDE2', '#FAE29C', '#B5EAD7', '#FFDAC1'];
const snap = (n: number) => Math.round(n * 8) / 8;

export default function JobView({ job }: { job: NestJob }) {
  const router = useRouter();
  const [bins, setBins] = useState<BinLayout[]>(job.panels);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(bins) !== JSON.stringify(job.panels);
  const planned = job.status === 'planned';
  const colour = (orderId: string) => PALETTE[job.summary.orderIds.indexOf(orderId) % PALETTE.length];
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: any }>, after?: (r: any) => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? 'Done.' } : { ok: false, text: r.error ?? 'Failed' });
      if (r.ok) after ? after(r) : router.refresh();
    });

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        {planned && dirty && (
          <>
            <button className="btn" disabled={pending} onClick={() => act(() => saveAdjusted(job.id, bins))}>Save layout</button>
            <button className="rounded-md border border-stone-300 px-3 py-2 text-sm" onClick={() => setBins(job.panels)}>Undo moves</button>
          </>
        )}
        <Link href={`/admin/nesting/${job.id}/cutlist`} className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm">Cut list (print)</Link>
        {planned && (
          <>
            <button className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" disabled={pending} onClick={() => act(() => rerun(job.id), (r) => router.push(`/admin/nesting/${r.data}`))}>Re-run</button>
            <button
              className="rounded-md bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={pending || dirty}
              title={dirty ? 'Save or undo your moves first' : undefined}
              onClick={() => confirm('Mark every panel as cut? Inventory drops, leftovers are saved as offcuts, and the orders move to In production.') && act(() => markCut(job.id))}
            >
              Mark as cut
            </button>
            <button className="ml-auto text-sm text-red-700" disabled={pending} onClick={() => confirm('Delete this plan?') && act(() => removeJob(job.id), () => router.push('/admin/nesting'))}>Delete plan</button>
          </>
        )}
        {msg && <span className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`} role="status">{msg.text}</span>}
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {bins.map((b, bi) => (
          <BinDrawing
            key={b.id}
            bin={b}
            margin={job.summary.marginIn}
            editable={planned}
            colour={colour}
            download={`/api/admin/nesting/${job.id}/panels/${encodeURIComponent(b.id)}`}
            onMove={(key, x, y) => setBins((bs) => bs.map((bb, j) => (j === bi ? { ...bb, placements: bb.placements.map((p) => (p.key === key ? { ...p, x, y } : p)) } : bb)))}
          />
        ))}
      </div>
    </div>
  );
}

function BinDrawing({ bin, margin, editable, colour, download, onMove }: { bin: BinLayout; margin: number; editable: boolean; colour: (orderId: string) => string; download: string; onMove: (key: string, x: number, y: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ key: string; dx: number; dy: number } | null>(null);
  const toSvg = (e: React.PointerEvent) => {
    const pt = svg.current!.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  };
  return (
    <section className="rounded-lg bg-white p-3 ring-1 ring-stone-200" aria-label={bin.label}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-medium">{bin.label} <span className="text-sm font-normal text-stone-500">{bin.w} × {bin.h} in · {bin.placements.length} part{bin.placements.length === 1 ? '' : 's'}</span></h2>
        <a href={download} className="rounded-md border border-stone-300 px-2 py-1 text-sm">Download SVG</a>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${bin.w} ${bin.h}`}
        className="h-auto w-full touch-none select-none bg-[#E3C9A0]"
        onPointerMove={(e) => {
          if (!drag.current) return;
          const p = toSvg(e);
          onMove(drag.current.key, snap(p.x - drag.current.dx), snap(p.y - drag.current.dy));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        <rect x={margin} y={margin} width={bin.w - 2 * margin} height={bin.h - 2 * margin} fill="none" stroke="#8a6d45" strokeWidth={0.08} strokeDasharray="0.4 0.3" />
        {bin.placements.map((p) => (
          <g
            key={p.key}
            onPointerDown={(e) => {
              if (!editable) return;
              (e.target as Element).setPointerCapture?.(e.pointerId);
              const q = toSvg(e);
              drag.current = { key: p.key, dx: q.x - p.x, dy: q.y - p.y };
            }}
            className={editable ? 'cursor-move' : ''}
          >
            <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={colour(p.orderId)} stroke="#333" strokeWidth={0.06} />
            <text x={p.x + 0.3} y={p.y + Math.min(1.4, p.h * 0.6)} fontSize={Math.min(1.2, p.h * 0.5, p.w / 5)} fill="#222">
              {p.orderNumber} · {p.partName}{p.rotation ? ' ↻' : ''}
            </text>
          </g>
        ))}
      </svg>
    </section>
  );
}
