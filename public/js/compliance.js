import { api, describeError } from './api.js';
import { html, mount, $, $$ } from './dom.js';
import { state } from './state.js';
import { openModal, closeModal, toast } from './ui.js';

let content = null;
let step = 1;
let answers = [];
let wrong = [];
let afterSign = null;

async function loadContent() {
  if (!content) content = await api('/compliance/regulations');
  return content;
}

function certificate(a) {
  return html`<div class="certificate">
    <strong>Certificate ID:</strong> ${a.certificateId}<br>
    <strong>Signed by:</strong> ${a.signedName}<br>
    <strong>Signed:</strong> ${new Date(a.signedAt).toLocaleString()}<br>
    <strong>Jurisdiction:</strong> ${a.jurisdiction}<br>
    <strong>Valid until:</strong> ${new Date(a.expiresAt).toLocaleDateString()}<br>
    <strong>Quiz score:</strong> ${a.quizScore}% · <strong>Version:</strong> ${a.version}
  </div>`;
}
export { certificate };

function stepBody() {
  if (step === 1) {
    return html`
      <div class="modal-section">
        <div class="modal-section-title">📜 Applicable International Regulations</div>
        <div class="modal-text">The following regulations govern transactions on this platform. Please read each one.</div>
        ${content.regulations.map((r) => html`<div class="reg-item"><span class="reg-badge">${r.code}</span><div>${r.text}</div></div>`)}
      </div>
      ${content.policies.map((p) => html`<div class="modal-section"><div class="modal-section-title">${p.title}</div><div class="modal-text">${p.text}</div></div>`)}`;
  }
  if (step === 2) {
    return html`
      <div class="modal-section">
        <div class="modal-section-title">✅ Comprehension Check</div>
        <div class="modal-text">Answer the questions below. You need ${Math.round(content.passRatio * 100)}% or higher to continue.</div>
      </div>
      ${content.quiz.map((q, i) => html`
        <fieldset class="quiz-question ${wrong.includes(i) ? 'wrong' : ''}">
          <legend class="quiz-q">${i + 1}. ${q.q}</legend>
          <div class="quiz-options">
            ${q.options.map((o, j) => html`
              <label class="quiz-opt"><input type="radio" name="q${i}" value="${j}" ${answers[i] === j ? 'checked' : ''}> ${o}</label>`)}
          </div>
        </fieldset>`)}`;
  }
  if (step === 3) {
    return html`
      <div class="modal-section">
        <div class="modal-section-title">✍️ Digital Signature</div>
        <div class="modal-text">By signing you confirm that you have read, understood, and agree to comply with the regulations above. Type your full legal name to sign.</div>
      </div>
      <label class="field">Full legal name
        <input id="signName" name="signedName" autocomplete="name" maxlength="120" value="${state.me?.name || ''}" required>
      </label>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="signConsent"> I agree to be bound by these regulations. I understand my signature, timestamp, and a pseudonymised network identifier will be recorded.</label>`;
  }
  return html`
    <div style="text-align:center;padding:10px 0;">
      <div style="font-size:48px;margin-bottom:12px;">✅</div>
      <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:var(--green);margin-bottom:8px;">Agreement Signed</div>
      <div class="modal-text">Your signed agreement has been recorded. You can now apply to gigs and negotiate contracts.</div>
    </div>
    ${certificate(state.compliance.agreement)}`;
}

function render() {
  const labels = { 1: 'I Have Read — Continue →', 2: 'Submit Answers →', 3: 'Sign & Complete →', 4: 'Close & Continue' };
  mount(
    $('#modal'),
    html`
    <div class="modal-header">
      <div class="modal-title" id="modalTitle">⚖️ International Regulations Agreement</div>
      <div class="modal-subtitle">Read, confirm your understanding, and sign digitally · version ${content.version}</div>
    </div>
    <div class="modal-body">
      <div class="step-indicator" aria-hidden="true">
        ${[1, 2, 3, 4].map((i) => html`<div class="step-dot ${i < step ? 'done' : i === step ? 'active' : ''}"></div>`)}
      </div>
      <div class="progress-bar" role="progressbar" aria-valuemin="1" aria-valuemax="4" aria-valuenow="${step}" aria-label="Step ${step} of 4"><div class="progress-fill" style="width:${step * 25}%"></div></div>
      ${stepBody()}
      <div class="form-error" role="alert" id="complianceError"></div>
    </div>
    <div class="modal-footer">
      ${step > 1 && step < 4 ? html`<button class="btn-secondary" data-action="compliance-back">← Back</button>` : ''}
      <button class="btn-secondary" data-action="close-modal">Close</button>
      <button class="btn-primary" data-action="compliance-next">${labels[step]}</button>
    </div>`,
  );
  $('#modal').scrollTop = 0;
}

export async function openCompliance({ onSigned } = {}) {
  afterSign = onSigned || null;
  try {
    await loadContent();
  } catch (err) {
    return toast(describeError(err), { error: true });
  }
  step = state.compliance.signed ? 4 : 1;
  answers = [];
  wrong = [];
  openModal(html``);
  render();
}

export async function complianceNext() {
  const err = $('#complianceError');
  if (step === 1) {
    step = 2;
    return render();
  }
  if (step === 2) {
    answers = content.quiz.map((_, i) => {
      const checked = $(`input[name="q${i}"]:checked`);
      return checked ? Number(checked.value) : -1;
    });
    if (answers.includes(-1)) {
      err.textContent = 'Please answer every question.';
      return;
    }
    wrong = [];
    step = 3;
    return render();
  }
  if (step === 3) {
    const signedName = $('#signName').value.trim();
    const consent = $('#signConsent').checked;
    if (signedName.length < 2) return void (err.textContent = 'Type your full name to sign.');
    if (!consent) return void (err.textContent = 'Please tick the box to confirm you agree.');
    const btn = $('[data-action="compliance-next"]');
    btn.disabled = true;
    try {
      const { agreement } = await api('/compliance/sign', { method: 'POST', body: { answers, signedName, consent } });
      state.compliance = { signed: true, agreement };
      step = 4;
      render();
      document.dispatchEvent(new CustomEvent('compliance:signed'));
    } catch (e) {
      if (e.code === 'QUIZ_FAILED') {
        wrong = e.details?.incorrect || [];
        step = 2;
        render();
        $('#complianceError').textContent = `${e.message} Questions highlighted in red need another look.`;
      } else {
        btn.disabled = false;
        err.textContent = describeError(e);
      }
    }
    return;
  }
  closeModal();
  const cb = afterSign;
  afterSign = null;
  cb?.();
}

export function complianceBack() {
  if (step === 3 || step === 2) {
    if (step === 2) answers = content.quiz.map((_, i) => Number($(`input[name="q${i}"]:checked`)?.value ?? -1));
    step -= 1;
    render();
  }
}

export async function refreshCompliance() {
  try {
    const s = await api('/compliance/status');
    state.compliance = { signed: s.signed, agreement: s.agreement };
  } catch {
    state.compliance = { signed: false, agreement: null };
  }
}

export { $$ };
