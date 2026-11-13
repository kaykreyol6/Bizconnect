import { api, describeError } from './api.js';
import { html, mount, $, $$, formData } from './dom.js';
import { state, place } from './state.js';
import { toast, openModal, closeModal, isModalOpen, formModal, setFormError, busy } from './ui.js';
import { postCard, commentList, gigCard, profileCard } from './components.js';
import { openCompliance, complianceNext, complianceBack, refreshCompliance } from './compliance.js';
import * as views from './views.js';

/* ── Routing ──────────────────────────────────────────────────────────────── */
const routes = {
  feed: views.feedView,
  businesses: views.businessesView,
  gigs: views.gigsView,
  bargains: views.bargainsView,
  contracts: views.contractsView,
  regulations: views.regulationsView,
  messages: views.messagesView,
  profile: views.profileView,
  settings: views.settingsView,
};

function parseHash() {
  const [path, qs] = (location.hash.replace(/^#\/?/, '') || 'feed').split('?');
  const [name, ...params] = path.split('/').filter(Boolean);
  return { name: routes[name] ? name : 'feed', params, query: new URLSearchParams(qs || '') };
}

async function render() {
  if (!state.me) return renderAuth();
  const { name, params, query } = parseHash();
  $$('#navMenu .nav-item').forEach((a) => {
    const active = a.dataset.route === name;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#sidebarLeft').classList.remove('open');
  const main = $('#main');
  try {
    await routes[name](main, query, params);
  } catch (err) {
    if (err.status === 401) return signedOut();
    mount(main, html`<div class="empty">Couldn't load this page: ${describeError(err)}</div>`);
  }
}

async function refreshChrome() {
  const me = state.me;
  $('#navLocation span').textContent = place(me) || 'Set location';
  $('#navLang span').textContent = (me.language || 'en').toUpperCase();
  try {
    const { stats } = await api(`/users/${me.id}`);
    state.stats = stats;
  } catch { /* non-critical */ }
  mount($('#profileCard'), profileCard(me, state.stats));
  await views.renderSidebarRight($('#sidebarRight'));
}

/* ── Unread message polling (see docs/SCALING.md: swap for SSE/WebSockets) ─ */
let pollTimer;
async function pollUnread() {
  if (!state.me || document.hidden) return;
  try {
    const { items } = await api('/messages/conversations');
    state.unread = items.reduce((n, c) => n + c.unread, 0);
    const badge = $('#unreadBadge');
    badge.textContent = state.unread;
    badge.hidden = !state.unread;
  } catch { /* ignore */ }
}

/* ── Auth ─────────────────────────────────────────────────────────────────── */
function showApp(on) {
  $('#authRoot').hidden = on;
  $('#appRoot').hidden = !on;
  $('#navRight').hidden = !on;
  $('#navLocation').hidden = !on;
  $('.menu-toggle').hidden = !on;
}

function renderAuth(mode = 'login') {
  showApp(false);
  mount(
    $('#authRoot'),
    html`
    <div class="auth-wrap">
      <div class="panel auth-card">
        <div class="auth-hero">
          <h1>Biz<span style="color:var(--gold)">Connect</span></h1>
          <p>The global business &amp; social platform — businesses, gigs, and bargains across borders.</p>
        </div>
        <div class="tab-bar" role="tablist" style="margin-bottom:16px">
          <button class="tab ${mode === 'login' ? 'active' : ''}" data-action="auth-mode" data-mode="login" role="tab" aria-selected="${mode === 'login'}">Sign in</button>
          <button class="tab ${mode === 'register' ? 'active' : ''}" data-action="auth-mode" data-mode="register" role="tab" aria-selected="${mode === 'register'}">Create account</button>
        </div>
        ${mode === 'login'
          ? html`
          <form data-form="login" novalidate>
            <div class="form-grid">
              <label class="field full">Email <input name="email" type="email" autocomplete="email" required></label>
              <label class="field full">Password <input name="password" type="password" autocomplete="current-password" required></label>
            </div>
            <div class="form-error" role="alert"></div>
            <div class="form-actions"><button class="btn-primary" type="submit">Sign in →</button></div>
            <div class="demo-hint">Demo account: <strong>jane@demo.bizconnect</strong> / <strong>demo-password</strong></div>
          </form>`
          : html`
          <form data-form="register" novalidate>
            <div class="form-grid">
              <label class="field full">Account type
                <select name="accountType" data-action-change="account-type">
                  <option value="individual">Individual / freelancer</option>
                  <option value="business">Business</option>
                </select>
              </label>
              <label class="field full" data-business-only hidden>Business name <input name="businessName" maxlength="160"></label>
              <label class="field full">Full name <input name="name" autocomplete="name" required maxlength="120"></label>
              <label class="field full">Email <input name="email" type="email" autocomplete="email" required></label>
              <label class="field full">Password <input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
              <label class="field">Industry ${views.industrySelect('industry', '')}</label>
              <label class="field">Country <input name="country" autocomplete="country-name" maxlength="80"></label>
              <label class="field">Region / State <input name="region" autocomplete="address-level1" maxlength="80"></label>
              <label class="field">City <input name="city" autocomplete="address-level2" maxlength="80"></label>
            </div>
            <p class="muted" style="margin-top:8px">🔒 Your street address is never shown unless you choose to publish it.</p>
            <div class="form-error" role="alert"></div>
            <div class="form-actions"><button class="btn-primary" type="submit">Create account →</button></div>
          </form>`}
      </div>
    </div>`,
  );
  $('#authRoot input')?.focus();
}

async function signedIn(user) {
  state.me = user;
  showApp(true);
  await refreshCompliance();
  await Promise.all([refreshChrome(), render()]);
  pollUnread();
  clearInterval(pollTimer);
  pollTimer = setInterval(pollUnread, 30_000);
}

function signedOut() {
  state.me = null;
  state.compliance = { signed: false, agreement: null };
  clearInterval(pollTimer);
  renderAuth();
}

/* ── Modals ───────────────────────────────────────────────────────────────── */
function gigModal() {
  openModal(
    formModal({
      title: '💼 Post a Gig',
      subtitle: 'Reach freelancers and businesses worldwide',
      form: 'gig',
      submitLabel: 'Publish gig',
      body: html`
        <div class="form-grid">
          <label class="field full">Title <input name="title" required minlength="3" maxlength="160" placeholder="e.g. Senior React Developer"></label>
          <label class="field full">Description <textarea name="description" required minlength="10" maxlength="5000"></textarea></label>
          <label class="field">Budget <input name="budget" required maxlength="80" placeholder="$3,000–$5,000 / project"></label>
          <label class="field">Max applications <input name="maxApplications" type="number" min="1" max="1000" value="50"></label>
          <label class="field">Industry ${views.industrySelect('industry', state.me.industry)}</label>
          <label class="check" style="align-self:end"><input type="checkbox" name="remote"> Remote — anyone can apply globally</label>
        </div>`,
    }),
  );
}

async function applyModal(gigId) {
  if (!state.compliance.signed) {
    toast('Please sign the regulations agreement first.');
    return openCompliance({ onSigned: () => applyModal(gigId) });
  }
  openModal(
    formModal({
      title: '✋ Apply to Gig',
      form: 'apply',
      submitLabel: 'Submit application',
      body: html`<input type="hidden" name="gigId" value="${gigId}">
        <label class="field">Message to the poster (optional)
          <textarea name="message" maxlength="2000" placeholder="Briefly describe your experience and availability"></textarea>
        </label>`,
    }),
  );
}

async function applicationsModal(gigId) {
  try {
    const { items } = await api(`/gigs/${gigId}/applications`, { query: { limit: 50 } });
    openModal(html`
      <div class="modal-header"><div class="modal-title" id="modalTitle">👥 Applications</div><div class="modal-subtitle">${items.length} received</div></div>
      <div class="modal-body"><div class="list">
        ${items.length
          ? items.map((a) => html`<div class="list-item">
              <strong><a href="#/profile/${a.applicant.id}" data-action="close-modal">${a.applicant.name}</a></strong>
              <span class="muted">${[a.applicant.city, a.applicant.country].filter(Boolean).join(', ')}</span>
              <span class="spacer"></span>
              <a class="btn-contract" href="#/messages/${a.applicant.id}" data-action="close-modal">💬 Message</a>
              ${a.message ? html`<div class="modal-text" style="flex-basis:100%">${a.message}</div>` : ''}
            </div>`)
          : html`<p class="muted">No applications yet.</p>`}
      </div></div>
      <div class="modal-footer"><button class="btn-secondary" data-action="close-modal">Close</button></div>`);
  } catch (err) {
    toast(describeError(err), { error: true });
  }
}

/* ── Click actions (event delegation; no inline handlers → strict CSP) ───── */
const actions = {
  'toggle-menu': () => $('#sidebarLeft').classList.toggle('open'),
  'toggle-dropdown': (el) => {
    const menu = $('#profileMenu');
    menu.hidden = !menu.hidden;
    el.setAttribute('aria-expanded', String(!menu.hidden));
  },
  logout: async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    location.hash = '#/feed';
    signedOut();
  },
  'auth-mode': (el) => renderAuth(el.dataset.mode),
  'open-compliance': () => openCompliance(),
  'compliance-next': () => complianceNext(),
  'compliance-back': () => complianceBack(),
  'close-modal': () => closeModal(),
  'load-more': (el) => views.loadMore(el.dataset.list),
  'composer-mode': (el) => {
    const form = el.closest('form');
    form.outerHTML = views.composer(el.dataset.mode).s;
    $('#composerInput')?.focus();
  },
  'new-gig': () => gigModal(),
  apply: (el) => applyModal(Number(el.dataset.id)),
  'view-applications': (el) => applicationsModal(Number(el.dataset.id)),
  'toggle-gig': async (el) => {
    try {
      const { gig } = await api(`/gigs/${el.dataset.id}`, { method: 'PATCH', body: { status: el.dataset.status } });
      replaceCard(el, gigCard(gig));
      toast(gig.status === 'open' ? 'Gig reopened' : 'Gig closed');
    } catch (err) {
      toast(describeError(err), { error: true });
    }
  },
  like: async (el) => {
    const liked = el.getAttribute('aria-pressed') === 'true';
    el.disabled = true;
    try {
      const { post } = await api(`/posts/${el.dataset.id}/like`, { method: liked ? 'DELETE' : 'PUT' });
      const card = el.closest('[data-post]');
      const commentsOpen = !card.querySelector('.comments').hidden;
      replaceCard(el, postCard(post, cardIndex(card)));
      if (commentsOpen) toggleComments($(`[data-post="${post.id}"] [data-action="toggle-comments"]`));
    } catch (err) {
      el.disabled = false;
      toast(describeError(err), { error: true });
    }
  },
  'toggle-comments': (el) => toggleComments(el),
  'delete-post': async (el) => {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
      await api(`/posts/${el.dataset.id}`, { method: 'DELETE' });
      el.closest('[data-post]').remove();
      toast('Post deleted');
    } catch (err) {
      toast(describeError(err), { error: true });
    }
  },
  share: async (el) => {
    const url = `${location.origin}/#/feed`;
    const text = el.closest('[data-post]')?.querySelector('.card-body')?.textContent?.slice(0, 140) || 'BizConnect';
    if (navigator.share) return navigator.share({ title: 'BizConnect', text, url }).catch(() => {});
    await navigator.clipboard?.writeText(`${text}… ${url}`).catch(() => {});
    toast('Link copied to clipboard');
  },
  message: (el) => {
    closeModal();
    location.hash = `#/messages/${el.dataset.id}`;
  },
  negotiate: (el) => {
    const go = () => (location.hash = `#/messages/${el.dataset.id}`);
    if (state.compliance.signed) return go();
    toast('Sign the regulations agreement before negotiating contracts.');
    openCompliance({ onSigned: go });
  },
  print: () => window.print(),
};

function cardIndex(card) {
  return card.classList.contains('red-card') ? 1 : 0;
}

function replaceCard(el, tpl) {
  const card = el.closest('[data-post], [data-gig]');
  const tmp = document.createElement('div');
  tmp.innerHTML = tpl.s;
  const fresh = tmp.firstElementChild;
  if (card.classList.contains('red-card') !== fresh.classList.contains('red-card')) {
    fresh.classList.toggle('red-card');
    fresh.classList.toggle('white-card');
  }
  card.replaceWith(fresh);
}

async function toggleComments(el) {
  const box = $(`[data-comments="${el.dataset.id}"]`);
  const open = box.hidden;
  box.hidden = !open;
  el.setAttribute('aria-expanded', String(open));
  if (!open) return;
  mount(box, html`<div class="muted">Loading comments…</div>`);
  try {
    const { items } = await api(`/posts/${el.dataset.id}/comments`, { query: { limit: 50 } });
    mount(box, commentList(items, el.dataset.id));
    box.querySelector('input')?.focus();
  } catch (err) {
    mount(box, html`<div class="muted">${describeError(err)}</div>`);
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!e.target.closest('.dropdown')) $('#profileMenu').hidden = true;
  if (e.target === $('#modalOverlay')) return closeModal();
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (el.tagName !== 'A' || el.dataset.action !== 'close-modal') e.preventDefault();
  fn(el, e);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isModalOpen()) closeModal();
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-action-change="account-type"]')) {
    $$('[data-business-only]').forEach((n) => (n.hidden = t.value !== 'business'));
  }
  const form = t.closest('form[data-form]');
  if (form?.dataset.form === 'gig-filter') {
    const d = formData(form);
    location.hash = `#/gigs?${new URLSearchParams(Object.entries(d).filter(([, v]) => v))}`;
  }
  if (form?.dataset.form === 'a11y') {
    const d = formData(form);
    const prefs = { large: d.large, contrast: d.contrast, motion: d.motion };
    try {
      localStorage.setItem('bc_a11y', JSON.stringify(prefs));
    } catch { /* storage may be unavailable */ }
    views.applyPrefs(prefs);
  }
});

/* ── Form submissions ─────────────────────────────────────────────────────── */
const forms = {
  async login(form, d) {
    const { user } = await api('/auth/login', { method: 'POST', body: d });
    await signedIn(user);
  },
  async register(form, d) {
    const body = { ...d };
    for (const k of Object.keys(body)) if (body[k] === '') delete body[k];
    if (body.accountType !== 'business') delete body.businessName;
    const { user } = await api('/auth/register', { method: 'POST', body });
    await signedIn(user);
    toast(`Welcome to BizConnect, ${user.name}!`);
  },
  async post(form, d) {
    if (!d.body) return setFormError(form, 'Write something first.');
    const body = { type: d.type, body: d.body };
    if (d.type === 'bargain') {
      const amount = Number(d.price);
      if (!d.price || !(amount >= 0)) return setFormError(form, 'Enter a valid price.');
      body.price = { amountCents: Math.round(amount * 100), currency: d.currency };
    }
    const { post } = await api('/posts', { method: 'POST', body });
    form.reset();
    const list = $('#feedList, #bargainList');
    if (list) {
      list.querySelector('.empty')?.remove();
      list.insertAdjacentHTML('afterbegin', postCard(post, 0).s);
    }
    toast('Posted!');
    refreshChrome();
  },
  async comment(form, d) {
    const id = form.dataset.id;
    await api(`/posts/${id}/comments`, { method: 'POST', body: { body: d.body } });
    const { items } = await api(`/posts/${id}/comments`, { query: { limit: 50 } });
    mount($(`[data-comments="${id}"]`), commentList(items, id));
    const btn = $(`[data-post="${id}"] [data-action="toggle-comments"]`);
    if (btn) btn.textContent = `💬 ${items.length} ${items.length === 1 ? 'Comment' : 'Comments'}`;
    $(`[data-comments="${id}"] input`)?.focus();
  },
  async gig(form, d) {
    const body = {
      title: d.title,
      description: d.description,
      budget: d.budget,
      remote: d.remote,
      maxApplications: Number(d.maxApplications) || 50,
    };
    if (d.industry) body.industry = d.industry;
    await api('/gigs', { method: 'POST', body });
    closeModal();
    toast('Gig published!');
    location.hash = '#/gigs';
    render();
    refreshChrome();
  },
  async apply(form, d) {
    try {
      const { gig } = await api(`/gigs/${d.gigId}/apply`, { method: 'POST', body: d.message ? { message: d.message } : {} });
      closeModal();
      const btn = $(`[data-gig="${gig.id}"] [data-action="apply"]`);
      if (btn) replaceCard(btn, gigCard(gig));
      toast('Application submitted ✓');
      refreshChrome();
    } catch (err) {
      if (err.code === 'COMPLIANCE_REQUIRED') {
        closeModal();
        return openCompliance({ onSigned: () => applyModal(d.gigId) });
      }
      throw err;
    }
  },
  async message(form, d) {
    const id = Number(form.dataset.id);
    await api('/messages', { method: 'POST', body: { recipientId: id, body: d.body } });
    await views.messagesView($('#main'), new URLSearchParams(), [String(id)]);
  },
  async profile(form, d) {
    const body = {
      name: d.name,
      businessName: d.businessName || null,
      industry: d.industry || null,
      language: d.language,
      country: d.country || null,
      region: d.region || null,
      city: d.city || null,
      streetAddress: d.streetAddress || null,
      addressPublic: d.addressPublic,
      bio: d.bio || null,
    };
    const { user } = await api('/users/me', { method: 'PATCH', body });
    state.me = user;
    await refreshChrome();
    toast('Profile saved');
  },
  'biz-search'(form, d) {
    location.hash = `#/businesses?${new URLSearchParams(Object.entries(d).filter(([, v]) => v))}`;
  },
  'gig-filter'() {},
  a11y() {},
};

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const handler = forms[form.dataset.form];
  if (!handler) return;
  setFormError(form, '');
  await busy(form, async () => {
    try {
      await handler(form, formData(form));
    } catch (err) {
      if (err.status === 401 && !['login', 'register'].includes(form.dataset.form)) return signedOut();
      setFormError(form, describeError(err));
      if (!form.querySelector('.form-error')) toast(describeError(err), { error: true });
    }
  });
});

document.addEventListener('compliance:signed', () => {
  refreshChrome();
  if (['contracts', 'regulations', 'gigs'].includes(parseHash().name)) render();
});
document.addEventListener('messages:read', () => pollUnread());
document.addEventListener('visibilitychange', () => !document.hidden && pollUnread());
window.addEventListener('hashchange', () => {
  if (isModalOpen()) closeModal();
  render();
  $('#main').focus({ preventScroll: true });
  window.scrollTo(0, 0);
});

/* ── Boot ─────────────────────────────────────────────────────────────────── */
(async function boot() {
  views.applyPrefs();
  try {
    state.industries = (await api('/meta/industries')).items;
  } catch { /* directory chips will be empty */ }
  try {
    const { user } = await api('/auth/me');
    await signedIn(user);
  } catch {
    signedOut();
  }
})();
