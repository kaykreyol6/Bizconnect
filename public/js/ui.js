import { $, mount, html } from './dom.js';

let toastTimer;
export function toast(message, { error = false } = {}) {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}

let lastFocus = null;
let onClose = null;

export function openModal(tpl, { onClosed } = {}) {
  lastFocus = document.activeElement;
  onClose = onClosed || null;
  mount($('#modal'), tpl);
  $('#modalOverlay').classList.add('active');
  const first = $('#modal').querySelector('input, select, textarea, button.btn-primary');
  (first || $('#modal')).focus?.();
}

export function closeModal() {
  $('#modalOverlay').classList.remove('active');
  $('#modal').innerHTML = '';
  const cb = onClose;
  onClose = null;
  cb?.();
  lastFocus?.focus?.();
}

export const isModalOpen = () => $('#modalOverlay').classList.contains('active');

/** Standard modal chrome around a form body. */
export function formModal({ title, subtitle, form, body, submitLabel = 'Submit' }) {
  return html`
    <div class="modal-header">
      <div class="modal-title" id="modalTitle">${title}</div>
      ${subtitle ? html`<div class="modal-subtitle">${subtitle}</div>` : ''}
    </div>
    <form data-form="${form}" novalidate>
      <div class="modal-body">${body}<div class="form-error" role="alert"></div></div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn-primary">${submitLabel}</button>
      </div>
    </form>`;
}

export function setFormError(form, msg) {
  const el = form.querySelector('.form-error');
  if (el) el.textContent = msg || '';
}

/** Disable a form's submit button while `fn` runs. */
export async function busy(form, fn) {
  const btn = form.querySelector('[type=submit]');
  if (btn?.disabled) return;
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } finally {
    if (btn) btn.disabled = false;
  }
}
