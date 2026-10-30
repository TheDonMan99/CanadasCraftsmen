'use client';

// Background colours behind the sign preview (Settings → Preview backgrounds), so a
// white or dark sign is easy to see. Mock-up only: the cut never changes. The choice
// is remembered on this device.

import { useEffect, useState } from 'react';

export interface Backdrop {
  name: string;
  hex: string;
  siding?: boolean;
}

const KEY = 'cc-backdrop';

/** The chosen backdrop, remembered on this device; the first one until something is picked. */
export function useBackdrop(list: Backdrop[]): [Backdrop | undefined, (b: Backdrop) => void] {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    try {
      setName(localStorage.getItem(KEY));
    } catch {}
  }, []);
  const chosen = list.find((b) => b.name === name) ?? list[0];
  const pick = (b: Backdrop) => {
    setName(b.name);
    try {
      localStorage.setItem(KEY, b.name);
    } catch {}
  };
  return [chosen, pick];
}

export default function BackdropPicker({ list, value, onPick }: { list: Backdrop[]; value?: Backdrop; onPick: (b: Backdrop) => void }) {
  if (list.length < 2) return null;
  return (
    <div role="group" aria-label="Preview background" className="flex flex-wrap items-center gap-1">
      {list.map((b) => (
        <button
          key={b.name}
          type="button"
          title={b.name}
          aria-label={`${b.name} background`}
          aria-pressed={value?.name === b.name}
          onClick={() => onPick(b)}
          className="flex h-11 w-11 items-center justify-center rounded-full"
        >
          <span
            className={`block h-7 w-7 rounded-full border ${value?.name === b.name ? 'border-char ring-2 ring-char ring-offset-2 ring-offset-paper' : 'border-line-strong'}`}
            style={{ background: b.hex }}
          />
        </button>
      ))}
    </div>
  );
}
