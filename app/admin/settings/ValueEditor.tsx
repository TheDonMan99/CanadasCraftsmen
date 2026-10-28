'use client';

// Edits a JSON object field by field, with an input that suits each value's
// type. Lists of words are typed comma-separated, long text gets a text box,
// nested groups get their own fields, and lists of objects are edited as JSON.

import { useState } from 'react';

const label = (k: string) =>
  k
    .replace(/_in$/, ' (in)')
    .replace(/_cents$/, ' (cents)')
    .replace(/_pct$/, ' (%)')
    .replace(/_in_min$/, ' (in/min)')
    .replace(/_/g, ' ');

export function ValueEditor({ value, onChange }: { value: Record<string, any>; onChange: (v: Record<string, any>) => void }) {
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Object.entries(value).map(([k, v]) => (
        <Field key={k} name={k} value={v} onChange={(nv) => set(k, nv)} />
      ))}
    </div>
  );
}

function Field({ name, value, onChange }: { name: string; value: any; onChange: (v: any) => void }) {
  const cls = 'input mt-0.5';
  if (typeof value === 'boolean')
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        {label(name)}
      </label>
    );
  if (typeof value === 'number' || value === null && /(_in|_cents|_pct|speed|passes)/.test(name))
    return (
      <label className="block text-xs text-stone-600">
        {label(name)}
        <input type="number" step="any" className={cls} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
      </label>
    );
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))
    return (
      <label className="block text-xs text-stone-600">
        {label(name)}
        <span className="mt-0.5 flex gap-2">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
          <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
        </span>
      </label>
    );
  if (typeof value === 'string' && (value.length > 80 || value.includes('\n')))
    return (
      <label className="block text-xs text-stone-600 sm:col-span-2">
        {label(name)}
        <textarea className={cls} rows={Math.min(12, value.split('\n').length + 2)} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  if (typeof value === 'string' || value === null)
    return (
      <label className="block text-xs text-stone-600">
        {label(name)}
        <input className={cls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  if (Array.isArray(value) && value.every((x) => typeof x === 'string' || typeof x === 'number')) {
    const numeric = value.length > 0 && value.every((x) => typeof x === 'number');
    return <ListField name={name} value={value} numeric={numeric} onChange={onChange} />;
  }
  if (value && typeof value === 'object' && !Array.isArray(value))
    return (
      <fieldset className="rounded-md border border-stone-200 p-2 sm:col-span-2">
        <legend className="px-1 text-xs font-medium text-stone-700">{label(name)}</legend>
        <ValueEditor value={value} onChange={onChange} />
      </fieldset>
    );
  return <JsonField name={name} value={value} onChange={onChange} />;
}

function ListField({ name, value, numeric, onChange }: { name: string; value: (string | number)[]; numeric: boolean; onChange: (v: any) => void }) {
  const [text, setText] = useState(value.join(', '));
  return (
    <label className="block text-xs text-stone-600 sm:col-span-2">
      {label(name)} <span className="text-stone-400">(comma-separated)</span>
      <input
        className="input mt-0.5"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
          onChange(numeric ? parts.map(Number) : parts);
        }}
      />
    </label>
  );
}

export function JsonField({ name, value, onChange }: { name: string; value: any; onChange: (v: any) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <label className="block text-xs text-stone-600 sm:col-span-2">
      {label(name)} <span className="text-stone-400">(JSON)</span>
      <textarea
        className={`input mt-0.5 font-mono text-xs ${bad ? 'border-red-500' : ''}`}
        rows={Math.min(12, text.split('\n').length + 1)}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
    </label>
  );
}
