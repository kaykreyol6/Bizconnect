// Tiny safe templating: every interpolated value is HTML-escaped unless it is
// itself the output of `html` (or wrapped with `raw`). This is the XSS boundary
// for all user-generated content.
const RAW = Symbol('raw');

export const raw = (s) => ({ [RAW]: true, s: String(s) });

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function render(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (typeof v === 'object' && v[RAW]) return v.s;
  return esc(v);
}

export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return raw(out);
}

export function mount(el, tpl) {
  el.innerHTML = tpl[RAW] ? tpl.s : esc(tpl);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function timeAgo(isoString) {
  const s = Math.max(0, (Date.now() - new Date(isoString).getTime()) / 1000);
  if (s < 60) return 'just now';
  const units = [['y', 31536000], ['mo', 2592000], ['d', 86400], ['h', 3600], ['m', 60]];
  for (const [u, sec] of units) if (s >= sec) return `${Math.floor(s / sec)}${u} ago`;
  return 'just now';
}

export function money({ amountCents, currency }) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value.trim();
  }
  return out;
}
