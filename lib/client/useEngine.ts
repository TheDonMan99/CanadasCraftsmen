'use client';

// Runs the engine in a Web Worker whenever the design changes, a moment after
// the last change, and keeps the latest result.

import { useEffect, useRef, useState } from 'react';
import type { CatalogOption, Settings } from '@/lib/config/catalog';
import type { Design, EngineResult } from '@/lib/engine/types';

export function useEngine(design: Design | null, materialId: string, catalog: CatalogOption[], settings: Settings, delayMs = 250) {
  const [result, setResult] = useState<EngineResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const w = new Worker(new URL('./engine.worker.ts', import.meta.url));
    w.onmessage = (e) => {
      if (e.data.id !== seq.current) return;
      setBusy(false);
      if (e.data.error) setError(e.data.error);
      else {
        setError('');
        setResult(e.data.result);
      }
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  const key = JSON.stringify([design, materialId]);
  useEffect(() => {
    if (!design) return;
    setBusy(true);
    const t = setTimeout(() => {
      seq.current += 1;
      worker.current?.postMessage({ id: seq.current, design, materialId, overrides: {}, catalog, settings });
    }, delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, catalog, settings]);

  return { result, busy, error };
}
