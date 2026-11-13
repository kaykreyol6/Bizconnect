import { api, describeError } from './api.js';
import { html, mount, $, timeAgo } from './dom.js';
import { state, industryLabel, place } from './state.js';
import { postCard, businessCard, gigCard, profileCard, empty, loading } from './components.js';
import { certificate } from './compliance.js';

/* ── Paged list with "Load more" (keyset cursor) ─────────────────────────── */
const lists = new Map();
let listSeq = 0;

export async function pagedList(container, { fetch, item, emptyMsg }) {
  const id = String(++listSeq);
  const entry = { fetch, item, emptyMsg, cursor: null, count: 0, container };
  lists.set(id, entry);
  container.dataset.list = id;
  mount(container, loading());
  await loadMore(id, true);
}

export async function loadMore(id, first = false) {
  const entry = lists.get(id);
  if (!entry || !entry.container.isConnected) return;
  const btn = entry.container.querySelector('[data-action="load-more"]');
  if (btn) btn.disabled = true;
  try {
    const data = await entry.fetch(entry.cursor);
    if (first) entry.container.innerHTML = '';
    btn?.remove();
    if (first && !data.items.length) {
      mount(entry.container, empty(data.hint || entry.emptyMsg));
      return;
    }
    const frag = data.items.map((it) => entry.item(it, entry.count++).s).join('');
    entry.container.insertAdjacentHTML('beforeend', frag);
    entry.cursor = data.nextCursor;
    if (data.nextCursor) {
      entry.container.insertAdjacentHTML('beforeend', html`<button class="btn-secondary load-more" data-action="load-more" data-list="${id}">Load more</button>`.s);
    }
  } catch (err) {
    mount(entry.container, empty(`Couldn't load: ${describeError(err)}`));
  }
}

function industrySelect(name, selected, { allowEmpty = true } = {}) {
  return html`<select name="${name}">
    ${allowEmpty ? html`<option value="">— Any industry —</option>` : ''}
    ${state.industries.map((i) => html`<option value="${i.slug}" ${i.slug === selected ? 'selected' : ''}>${i.icon} ${i.label}</option>`)}
  </select>`;
}
export { industrySelect };

/* ── Feed ─────────────────────────────────────────────────────────────────── */
const TABS = [
  ['all', '🌍 All Posts'],
  ['businesses', '🏢 Businesses'],
  ['gigs', '💼 Gigs'],
  ['bargains', '🏷️ Bargains'],
  ['regional', '🌐 Regional'],
];

export function composer(mode = 'update') {
  return html`
  <form class="composer" data-form="post">
    <div class="composer-top">
      <div class="composer-avatar" aria-hidden="true">${state.me.initials}</div>
      <label class="sr-only" for="composerInput">Post text</label>
      <input class="composer-input" id="composerInput" name="body" maxlength="5000" autocomplete="off"
        placeholder="${mode === 'bargain' ? 'Describe the product or deal…' : 'Share a business update, post a bargain, or announce a gig...'}">
    </div>
    <input type="hidden" name="type" value="${mode}">
    ${mode === 'bargain' ? html`
    <div class="composer-extra">
      <label class="sr-only" for="priceInput">Price</label>
      <input id="priceInput" name="price" type="number" min="0" step="0.01" placeholder="Price e.g. 24.99" required>
      <label class="sr-only" for="currencyInput">Currency</label>
      <select id="currencyInput" name="currency">${['USD', 'EUR', 'GBP', 'NGN', 'KES', 'INR', 'SGD', 'JPY', 'CNY', 'BRL', 'ZAR', 'CAD'].map((c) => html`<option>${c}</option>`)}</select>
    </div>` : ''}
    <div class="composer-actions">
      <div class="composer-tools">
        <button type="button" class="tool-btn ${mode === 'update' ? 'active' : ''}" data-action="composer-mode" data-mode="update">📝 Update</button>
        <button type="button" class="tool-btn ${mode === 'bargain' ? 'active' : ''}" data-action="composer-mode" data-mode="bargain">🏷️ Bargain</button>
        <button type="button" class="tool-btn" data-action="new-gig">💼 Gig</button>
        <span class="muted">📍 ${state.me.city || state.me.country || 'Set location in settings'}</span>
      </div>
      <button class="post-btn" type="submit">Post</button>
    </div>
    <div class="form-error" role="alert"></div>
  </form>`;
}

export async function feedView(main, query) {
  const tab = TABS.some(([k]) => k === query.get('tab')) ? query.get('tab') : 'all';
  mount(
    main,
    html`
    <div class="tab-bar" role="tablist">
      ${TABS.map(([k, label]) => html`<a class="tab ${k === tab ? 'active' : ''}" role="tab" aria-selected="${k === tab}" href="#/feed?tab=${k}">${label}</a>`)}
    </div>
    ${tab === 'gigs' ? html`<div class="row"><span class="spacer"></span><button class="post-btn" data-action="new-gig">+ Post a gig</button></div>` : composer(tab === 'bargains' ? 'bargain' : 'update')}
    <div class="main-feed" id="feedList"></div>`,
  );
  const list = $('#feedList');
  if (tab === 'businesses') {
    return pagedList(list, { fetch: (cursor) => api('/businesses', { query: { cursor } }), item: businessCard, emptyMsg: 'No businesses yet.' });
  }
  if (tab === 'gigs') {
    return pagedList(list, { fetch: (cursor) => api('/gigs', { query: { cursor } }), item: gigCard, emptyMsg: 'No open gigs right now.' });
  }
  const q = { all: {}, bargains: { type: 'bargain' }, regional: { scope: 'regional' } }[tab];
  return pagedList(list, {
    fetch: (cursor) => api('/posts', { query: { ...q, cursor } }),
    item: postCard,
    emptyMsg: tab === 'regional' ? 'No posts from your country yet — be the first!' : 'Nothing here yet — share the first post!',
  });
}

/* ── Businesses directory ─────────────────────────────────────────────────── */
export async function businessesView(main, query) {
  const industry = query.get('industry') || '';
  const q = query.get('q') || '';
  mount(
    main,
    html`
    <div class="panel">
      <h2>🏢 Business Directory</h2>
      <form class="row" data-form="biz-search">
        <label class="sr-only" for="bizQ">Search businesses</label>
        <input class="composer-input" id="bizQ" name="q" value="${q}" placeholder="Search by business name…">
        <input type="hidden" name="industry" value="${industry}">
        <button class="post-btn" type="submit">Search</button>
      </form>
      <div class="industry-grid wide" style="margin-top:12px">
        <a class="industry-chip ${industry ? '' : 'selected'}" href="#/businesses${q ? `?q=${encodeURIComponent(q)}` : ''}">🌐 All</a>
        ${state.industries.map((i) => html`<a class="industry-chip ${i.slug === industry ? 'selected' : ''}" href="#/businesses?industry=${i.slug}${q ? `&q=${encodeURIComponent(q)}` : ''}">${i.icon} ${i.label}</a>`)}
      </div>
    </div>
    <div class="main-feed" id="bizList"></div>`,
  );
  return pagedList($('#bizList'), {
    fetch: (cursor) => api('/businesses', { query: { industry, q, cursor } }),
    item: businessCard,
    emptyMsg: 'No businesses match these filters.',
  });
}

/* ── Gigs marketplace ─────────────────────────────────────────────────────── */
export async function gigsView(main, query) {
  const industry = query.get('industry') || '';
  const remote = query.get('remote') || '';
  mount(
    main,
    html`
    <div class="panel">
      <div class="row"><h2>💼 Gigs Marketplace</h2><span class="spacer"></span><button class="post-btn" data-action="new-gig">+ Post a gig</button></div>
      <form class="row" data-form="gig-filter">
        <label class="field">Industry ${industrySelect('industry', industry)}</label>
        <label class="field">Location
          <select name="remote">
            <option value="">Anywhere</option>
            <option value="true" ${remote === 'true' ? 'selected' : ''}>Remote only</option>
            <option value="false" ${remote === 'false' ? 'selected' : ''}>On-site only</option>
          </select>
        </label>
      </form>
      ${state.compliance.signed ? '' : html`<p class="muted" style="margin-top:10px">⚖️ You'll need to sign the regulations agreement before applying.</p>`}
    </div>
    <div class="main-feed" id="gigList"></div>`,
  );
  return pagedList($('#gigList'), {
    fetch: (cursor) => api('/gigs', { query: { industry, remote, cursor } }),
    item: gigCard,
    emptyMsg: 'No gigs match these filters.',
  });
}

/* ── Bargains ─────────────────────────────────────────────────────────────── */
export async function bargainsView(main) {
  mount(
    main,
    html`
    <div class="panel"><h2>🏷️ Bargains</h2><p class="muted">Listed prices from businesses worldwide. Contact the seller to negotiate a contract.</p></div>
    ${composer('bargain')}
    <div class="main-feed" id="bargainList"></div>`,
  );
  return pagedList($('#bargainList'), {
    fetch: (cursor) => api('/posts', { query: { type: 'bargain', cursor } }),
    item: postCard,
    emptyMsg: 'No bargains posted yet.',
  });
}

/* ── Contracts ────────────────────────────────────────────────────────────── */
export async function contractsView(main) {
  mount(main, loading());
  const [agreements, apps] = await Promise.all([api('/compliance/agreements'), api('/me/applications', { query: { limit: 50 } })]);
  mount(
    main,
    html`
    <div class="panel">
      <h2>📄 Regulations Agreement</h2>
      ${state.compliance.signed
        ? html`${certificate(state.compliance.agreement)}<div class="form-actions"><button class="btn-secondary" data-action="print">🖨️ Print certificate</button></div>`
        : html`<p class="modal-text">You haven't signed the current regulations agreement. It's required before applying to gigs or negotiating contracts.</p>
               <button class="btn-primary" data-action="open-compliance">Read &amp; Sign Now →</button>`}
      ${agreements.items.length > 1 ? html`<h3>History</h3><div class="list">${agreements.items.map((a) => html`<div class="list-item"><strong>${a.certificateId}</strong><span>v${a.version}</span><span class="muted">${new Date(a.signedAt).toLocaleDateString()} → ${new Date(a.expiresAt).toLocaleDateString()}</span></div>`)}</div>` : ''}
    </div>
    <div class="panel">
      <h2>✋ My Gig Applications</h2>
      ${apps.items.length
        ? html`<div class="list">${apps.items.map((a) => html`
            <div class="list-item">
              <strong>${a.gig.title}</strong><span class="muted">by ${a.gig.owner}</span>
              <span class="pill pill-red">${a.gig.budget}</span>
              <span class="spacer"></span>
              <span class="pill ${a.gig.status === 'open' ? 'pill-green' : 'pill-gray'}">${a.status} · gig ${a.gig.status}</span>
              <span class="muted">${timeAgo(a.appliedAt)}</span>
            </div>`)}</div>`
        : html`<p class="muted">You haven't applied to any gigs yet. <a href="#/gigs">Browse gigs →</a></p>`}
    </div>
    <div class="panel"><h2>💼 Gigs I Posted</h2><div class="main-feed" id="myGigs"></div></div>`,
  );
  return pagedList($('#myGigs'), {
    fetch: (cursor) => api('/gigs', { query: { author: state.me.id, status: 'all', cursor } }),
    item: gigCard,
    emptyMsg: "You haven't posted any gigs.",
  });
}

/* ── Regulations (read-only page) ─────────────────────────────────────────── */
export async function regulationsView(main) {
  mount(main, loading());
  const c = await api('/compliance/regulations');
  mount(
    main,
    html`
    <div class="panel">
      <h2>⚖️ International Regulations</h2>
      <p class="modal-text">Version ${c.version}. ${state.compliance.signed ? 'You have signed this version. ✅' : 'You have not signed this version yet.'}</p>
      ${c.regulations.map((r) => html`<div class="reg-item"><span class="reg-badge">${r.code}</span><div>${r.text}</div></div>`)}
      ${c.policies.map((p) => html`<h3>${p.title}</h3><p class="modal-text">${p.text}</p>`)}
      <div class="form-actions"><button class="btn-primary" data-action="open-compliance">${state.compliance.signed ? 'View my certificate' : 'Read & Sign Now →'}</button></div>
    </div>`,
  );
}

/* ── Messages ─────────────────────────────────────────────────────────────── */
export async function messagesView(main, query, params) {
  const otherId = params[0] ? Number(params[0]) : null;
  mount(main, loading());
  const convos = await api('/messages/conversations');
  let thread = null;
  if (otherId) thread = await api(`/messages/with/${otherId}`, { query: { limit: 50 } });
  mount(
    main,
    html`
    <div class="panel messages-layout">
      <nav class="convo-list" aria-label="Conversations">
        ${convos.items.length || thread
          ? [
              ...(thread && !convos.items.some((c) => c.user.id === otherId) ? [{ user: thread.user, lastMessage: null, unread: 0 }] : []),
              ...convos.items,
            ].map(
              (c) => html`
              <a class="convo ${c.user.id === otherId ? 'active' : ''}" href="#/messages/${c.user.id}">
                <div class="card-avatar" aria-hidden="true">${c.user.initials}</div>
                <div class="convo-meta">
                  <div class="convo-name">${c.user.businessName || c.user.name}</div>
                  <div class="convo-last">${c.lastMessage ? c.lastMessage.body : 'New conversation'}</div>
                </div>
                ${c.unread && c.user.id !== otherId ? html`<span class="nav-badge">${c.unread}</span>` : ''}
              </a>`,
            )
          : html`<p class="muted" style="padding:16px">No conversations yet. Use “Contact” on a post or business to start one.</p>`}
      </nav>
      <section class="thread" aria-label="Conversation">
        ${thread
          ? html`
            <div class="thread-head"><a href="#/profile/${thread.user.id}">${thread.user.businessName || thread.user.name}</a> <span class="muted">· ${place(thread.user)}</span></div>
            <div class="thread-body" id="threadBody">
              ${thread.items.length
                ? thread.items.map((m) => html`<div class="bubble ${m.senderId === state.me.id ? 'mine' : 'theirs'}">${m.body}<time datetime="${m.createdAt}">${timeAgo(m.createdAt)}</time></div>`)
                : html`<p class="muted" style="text-align:center">Say hello 👋</p>`}
            </div>
            <form class="thread-form" data-form="message" data-id="${thread.user.id}">
              <label class="sr-only" for="msgInput">Message</label>
              <input id="msgInput" name="body" maxlength="4000" placeholder="Write a message…" autocomplete="off" required>
              <button class="post-btn" type="submit">Send</button>
            </form>`
          : html`<div class="empty" style="margin:16px">Select a conversation.</div>`}
      </section>
    </div>`,
  );
  if (thread) $('#msgInput')?.focus();
  document.dispatchEvent(new CustomEvent('messages:read'));
}

/* ── Profile ──────────────────────────────────────────────────────────────── */
export async function profileView(main, query, params) {
  const id = params[0] === 'me' || !params[0] ? state.me.id : Number(params[0]);
  mount(main, loading());
  const { user, stats } = await api(`/users/${id}`);
  const self = user.id === state.me.id;
  mount(
    main,
    html`
    <div class="panel profile-card">
      ${profileCard(user, stats, { compact: false })}
      <div class="form-actions" style="justify-content:center">
        ${self
          ? html`<a class="btn-primary" href="#/settings" style="text-decoration:none">⚙️ Edit profile</a>`
          : html`<button class="btn-primary" data-action="message" data-id="${user.id}">💬 Message</button>
                 <button class="btn-secondary" data-action="negotiate" data-id="${user.id}">📋 Negotiate contract</button>`}
      </div>
    </div>
    <div class="tab-bar"><span class="tab active">📝 Posts</span></div>
    <div class="main-feed" id="profilePosts"></div>
    <div class="tab-bar"><span class="tab active">💼 Open gigs</span></div>
    <div class="main-feed" id="profileGigs"></div>`,
  );
  await Promise.all([
    pagedList($('#profilePosts'), { fetch: (cursor) => api('/posts', { query: { author: id, cursor } }), item: postCard, emptyMsg: 'No posts yet.' }),
    pagedList($('#profileGigs'), { fetch: (cursor) => api('/gigs', { query: { author: id, cursor } }), item: gigCard, emptyMsg: 'No open gigs.' }),
  ]);
}

/* ── Settings ─────────────────────────────────────────────────────────────── */
const LANGS = [['en', 'English'], ['fr', 'Français'], ['es', 'Español'], ['pt', 'Português'], ['ar', 'العربية'], ['zh', '中文'], ['hi', 'हिन्दी'], ['sw', 'Kiswahili'], ['yo', 'Yorùbá'], ['de', 'Deutsch'], ['ja', '日本語'], ['ht', 'Kreyòl Ayisyen']];

export function settingsView(main) {
  const u = state.me;
  const prefs = readPrefs();
  mount(
    main,
    html`
    <form class="panel" data-form="profile" novalidate>
      <h2>⚙️ Profile</h2>
      <div class="form-grid">
        <label class="field">Full name <input name="name" value="${u.name}" required maxlength="120" autocomplete="name"></label>
        <label class="field">Business name <input name="businessName" value="${u.businessName || ''}" maxlength="160" placeholder="${u.accountType === 'business' ? '' : '(individual account)'}"></label>
        <label class="field">Industry ${industrySelect('industry', u.industry)}</label>
        <label class="field">Language
          <select name="language">${LANGS.map(([code, label]) => html`<option value="${code}" ${code === u.language ? 'selected' : ''}>${label}</option>`)}</select>
        </label>
        <label class="field">Country <input name="country" value="${u.country || ''}" maxlength="80" autocomplete="country-name"></label>
        <label class="field">Region / State <input name="region" value="${u.region || ''}" maxlength="80" autocomplete="address-level1"></label>
        <label class="field">City <input name="city" value="${u.city || ''}" maxlength="80" autocomplete="address-level2"></label>
        <label class="field">Street address <input name="streetAddress" value="${u.streetAddress || ''}" maxlength="200" autocomplete="street-address"></label>
        <label class="check full"><input type="checkbox" name="addressPublic" ${u.addressPublic ? 'checked' : ''}>
          <span>Show my street address publicly. <span class="muted">Recommended only for registered business premises — country, region and city are always shown.</span></span></label>
        <label class="field full">Bio <textarea name="bio" maxlength="500">${u.bio || ''}</textarea></label>
      </div>
      <div class="form-error" role="alert"></div>
      <div class="form-actions"><button class="btn-primary" type="submit">Save profile</button></div>
    </form>
    <form class="panel" data-form="a11y">
      <h2>♿ Accessibility</h2>
      <p class="muted">Saved on this device.</p>
      <label class="check"><input type="checkbox" name="large" ${prefs.large ? 'checked' : ''}> Larger text</label>
      <label class="check"><input type="checkbox" name="contrast" ${prefs.contrast ? 'checked' : ''}> High contrast</label>
      <label class="check"><input type="checkbox" name="motion" ${prefs.motion ? 'checked' : ''}> Reduce motion</label>
    </form>
    <div class="panel"><h2>🔐 Account</h2><p class="muted">Signed in as ${u.email}. Member since ${new Date(u.createdAt).toLocaleDateString()}.</p></div>`,
  );
}

export function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem('bc_a11y') || '{}');
  } catch {
    return {};
  }
}

export function applyPrefs(prefs = readPrefs()) {
  const root = document.documentElement;
  root.classList.toggle('a11y-large', !!prefs.large);
  root.classList.toggle('a11y-contrast', !!prefs.contrast);
  root.classList.toggle('a11y-reduce-motion', !!prefs.motion);
}

/* ── Right sidebar ────────────────────────────────────────────────────────── */
export async function renderSidebarRight(el) {
  const c = state.compliance;
  let gigs = { items: [] };
  try {
    gigs = await api('/gigs', { query: { limit: 5 } });
  } catch { /* sidebar is best-effort */ }
  mount(
    el,
    html`
    <div class="compliance-banner ${c.signed ? 'signed' : ''}">
      <div class="compliance-title">⚖️ International Regulations</div>
      <div class="compliance-text">${c.signed
        ? html`Signed ✓ — certificate <strong>${c.agreement.certificateId}</strong>, valid until ${new Date(c.agreement.expiresAt).toLocaleDateString()}.`
        : 'Before applying to gigs or signing contracts, read and digitally sign the international commerce regulations (WTO, GDPR, CISG, eIDAS).'}</div>
      <button class="compliance-btn" data-action="open-compliance">${c.signed ? 'View certificate' : 'Read & Sign Now →'}</button>
    </div>
    <div class="widget">
      <div class="widget-header">💼 Latest Gigs <span style="font-size:11px;opacity:0.8;font-weight:400;">Open now</span></div>
      <div class="widget-body">
        ${gigs.items.length
          ? gigs.items.map((g) => html`
            <div class="gig-item"><a href="#/gigs">
              <div class="gig-title">${g.title}</div>
              <div class="gig-budget">${g.budget}</div>
              <div class="gig-meta">
                <span class="gig-range">${g.remote ? '🌐 Remote' : `📍 ${[g.city, g.country].filter(Boolean).join(', ')}`}</span>
                <span class="gig-apps">${g.applicationCount}/${g.maxApplications} apps</span>
              </div></a>
            </div>`)
          : html`<p class="muted">No open gigs.</p>`}
        <a class="view-all" href="#/gigs" style="display:block;text-decoration:none">View all gigs →</a>
      </div>
    </div>
    <div class="widget">
      <div class="widget-header">🏢 Industry Directory</div>
      <div class="widget-body">
        <div class="industry-grid">
          ${state.industries.map((i) => html`<a class="industry-chip ${i.slug === state.me.industry ? 'selected' : ''}" href="#/businesses?industry=${i.slug}" style="text-decoration:none">${i.icon} ${i.label}</a>`)}
        </div>
        <a class="view-all" href="#/businesses" style="display:block;text-decoration:none">Browse all businesses →</a>
      </div>
    </div>`,
  );
}

export { industryLabel };
