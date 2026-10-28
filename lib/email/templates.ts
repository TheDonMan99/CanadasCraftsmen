// Email templates from Settings → Emails: {variables} filled from the order,
// customer text escaped, and a plain-text and an HTML version of each.

import type { Settings } from '@/lib/config/catalog';
import type { QuoteLine } from '@/lib/pricing';
import { dollars } from '@/lib/pricing';

export type TemplateKey = keyof Settings['emails']['templates'];
export type Vars = Record<string, string>;

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Replaces {name} with its value; unknown names are left as they are. */
export function fill(template: string, vars: Vars): string {
  return template.replace(/\{([a-z_]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

const URL_RE = /(https?:\/\/[^\s<]+)/g;

/** Paragraphs of escaped text, with links made clickable. */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(URL_RE, '<a href="$1">$1</a>').replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export interface RenderOptions {
  /** cid of an inline preview image */
  previewCid?: string;
  lines?: QuoteLine[];
  totalCents?: number;
  showBreakdown?: boolean;
}

export function renderEmail(t: { subject: string; body: string }, vars: Vars, opt: RenderOptions = {}) {
  const subject = fill(t.subject, vars).replace(/[\r\n]+/g, ' ').slice(0, 200);
  const text = fill(t.body, vars);
  let html = textToHtml(text);
  if (opt.previewCid) {
    const img = `<p style="margin:0 0 14px"><img src="cid:${opt.previewCid}" alt="Sign preview" width="560" style="max-width:100%;height:auto;border:1px solid #e7e5e4;border-radius:6px"></p>`;
    // the preview goes after the first paragraph, near the top
    const cut = html.indexOf('</p>') + 4;
    html = html.slice(0, cut) + img + html.slice(cut);
  }
  if (opt.showBreakdown && opt.lines?.length) {
    const rows = opt.lines
      .map((l) => `<tr><td style="padding:2px 12px 2px 0">${escapeHtml(l.label)}${l.note ? ` <em>(${escapeHtml(l.note)})</em>` : ''}</td><td style="text-align:right">${dollars(l.cents)}</td></tr>`)
      .join('');
    html += `<table style="border-collapse:collapse;font-size:14px;margin:0 0 14px">${rows}<tr><td style="padding:4px 12px 2px 0;border-top:1px solid #ccc"><strong>Total</strong></td><td style="text-align:right;border-top:1px solid #ccc"><strong>${dollars(opt.totalCents ?? 0)}</strong></td></tr></table>`;
  }
  html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c1917;max-width:600px;margin:0 auto;padding:16px">${html}</body></html>`;
  return { subject, text, html };
}

/** "Name <address>" for the From line; the address alone when there's no name. */
export function fromLine(name: string, address: string): string {
  const n = name.replace(/[<>"\r\n]/g, '').trim();
  return n && !n.startsWith('[') ? `${n} <${address}>` : address;
}
