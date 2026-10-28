'use client';

// One-off engine runs in a shared Web Worker, for jobs like rendering a design at
// every size (listing images) without blocking the page.

import type { CatalogOption, Settings } from '@/lib/config/catalog';
import type { Design, EngineResult } from '@/lib/engine/types';

let worker: Worker | null = null;
let seq = 1_000_000;
const waiting = new Map<number, (r: { result?: EngineResult; error?: string }) => void>();

export function runEngineOnce(design: Design, materialId: string, catalog: CatalogOption[], settings: Settings): Promise<EngineResult> {
  if (!worker) {
    worker = new Worker(new URL('./engine.worker.ts', import.meta.url));
    worker.onmessage = (e) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, (r) => (r.result ? resolve(r.result) : reject(new Error(r.error ?? 'Engine failed'))));
    worker!.postMessage({ id, design, materialId, overrides: {}, catalog, settings });
  });
}

/** A square PNG of a preview SVG with a caption underneath, sized for Messenger and Marketplace. */
export async function squareImage(svg: string, caption: string, sizePx = 1080, background = '#F4F1EC'): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Could not draw the preview'));
      img.src = url;
    });
    const c = document.createElement('canvas');
    c.width = c.height = sizePx;
    const g = c.getContext('2d')!;
    g.fillStyle = background;
    g.fillRect(0, 0, sizePx, sizePx);
    const pad = sizePx * 0.06, captionH = caption ? sizePx * 0.12 : 0;
    const boxW = sizePx - 2 * pad, boxH = sizePx - 2 * pad - captionH;
    const s = Math.min(boxW / img.width, boxH / img.height);
    const w = img.width * s, h = img.height * s;
    g.drawImage(img, (sizePx - w) / 2, pad + (boxH - h) / 2, w, h);
    if (caption) {
      g.fillStyle = '#1c1917';
      g.font = `600 ${Math.round(sizePx * 0.045)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      g.textAlign = 'center';
      g.fillText(caption, sizePx / 2, sizePx - pad - captionH * 0.3);
    }
    return await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
