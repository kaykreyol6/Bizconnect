import { html, timeAgo, money } from './dom.js';
import { state, industryLabel, place } from './state.js';

const authorName = (a) => a.businessName || a.name;

export function postCard(p, index) {
  const tone = index % 2 === 1 ? 'red-card' : 'white-card';
  const mine = state.me && p.author.id === state.me.id;
  return html`
  <article class="feed-card ${tone}" data-post="${p.id}">
    <div class="card-header">
      <div class="card-avatar" aria-hidden="true">${p.author.initials}</div>
      <div class="card-meta">
        <div class="card-name"><a href="#/profile/${p.author.id}">${authorName(p.author)}</a>${p.type === 'bargain' ? ' — Bargain' : ''}</div>
        <div class="card-sub">${industryLabel(p.author.industry) || (p.author.accountType === 'business' ? 'Business' : 'Member')} · <span class="card-time">${timeAgo(p.createdAt)}</span></div>
      </div>
      ${p.author.verified ? html`<span class="verified-badge">✓ Verified</span>` : ''}
    </div>
    ${p.price ? html`<div class="price-tag">🏷️ ${money(p.price)} <span class="official-price">— listed price</span></div>` : ''}
    <div class="card-body">${p.body}</div>
    ${p.city || p.country ? html`<div class="card-location">📍 ${[p.city, p.country].filter(Boolean).join(', ')}</div>` : ''}
    <div class="card-actions">
      <button class="action-btn ${p.likedByMe ? 'on' : ''}" data-action="like" data-id="${p.id}" aria-pressed="${p.likedByMe}">❤️ ${p.likeCount} ${p.likeCount === 1 ? 'Like' : 'Likes'}</button>
      <button class="action-btn" data-action="toggle-comments" data-id="${p.id}" aria-expanded="false">💬 ${p.commentCount} ${p.commentCount === 1 ? 'Comment' : 'Comments'}</button>
      ${!mine ? html`<button class="action-btn" data-action="message" data-id="${p.author.id}">✉️ Contact</button>` : ''}
      ${p.type === 'bargain' && !mine ? html`<button class="action-btn" data-action="negotiate" data-id="${p.author.id}">📋 Negotiate</button>` : ''}
      <button class="action-btn" data-action="share" data-id="${p.id}">🔗 Share</button>
      ${mine ? html`<button class="action-btn" data-action="delete-post" data-id="${p.id}">🗑️ Delete</button>` : ''}
    </div>
    <div class="comments" data-comments="${p.id}" hidden></div>
  </article>`;
}

export function commentList(items, postId) {
  return html`
    ${items.length ? items.slice().reverse().map((c) => html`<div class="comment"><b><a href="#/profile/${c.author.id}">${authorName(c.author)}</a></b>${c.body}</div>`) : html`<div class="muted">No comments yet.</div>`}
    <form class="comment-form" data-form="comment" data-id="${postId}">
      <label class="sr-only" for="c-${postId}">Add a comment</label>
      <input id="c-${postId}" name="body" maxlength="2000" placeholder="Write a comment…" required autocomplete="off">
      <button type="submit">Send</button>
    </form>`;
}

export function businessCard(b) {
  const mine = state.me && b.id === state.me.id;
  return html`
  <article class="biz-listing">
    <div class="biz-header">
      <div class="biz-avatar" aria-hidden="true">${b.initials}</div>
      <div>
        <div class="biz-name"><a href="#/profile/${b.id}">${b.businessName || b.name}</a></div>
        <div class="biz-industry">${industryLabel(b.industry) || 'Business'}${b.bio ? ` · ${b.bio}` : ''}</div>
      </div>
      ${b.verified ? html`<div class="biz-verified">✓ Verified</div>` : ''}
    </div>
    ${b.streetAddress ? html`<div class="public-notice">📍 Public address: ${b.streetAddress}</div>` : ''}
    <div class="biz-details">
      <div class="biz-detail-item"><div class="biz-detail-label">Country</div><div class="biz-detail-value">${b.country || '—'}</div></div>
      <div class="biz-detail-item"><div class="biz-detail-label">Region</div><div class="biz-detail-value">${b.region || '—'}</div></div>
      <div class="biz-detail-item"><div class="biz-detail-label">City</div><div class="biz-detail-value">${b.city || '—'}</div></div>
      <div class="biz-detail-item"><div class="biz-detail-label">Active Gigs</div><div class="biz-detail-value">${b.openGigs ?? 0} open</div></div>
    </div>
    <div class="biz-actions">
      ${mine ? html`<a class="btn-contract" href="#/settings">Edit profile</a>` : html`
        <button class="btn-contact" data-action="message" data-id="${b.id}">💬 Contact</button>
        <button class="btn-contract" data-action="negotiate" data-id="${b.id}">📋 Sign Contract</button>`}
      <a class="btn-contract" href="#/profile/${b.id}">View profile →</a>
    </div>
  </article>`;
}

export function gigCard(g, index = 0) {
  const tone = index % 2 === 1 ? 'red-card' : 'white-card';
  const mine = state.me && g.author.id === state.me.id;
  const full = g.applicationCount >= g.maxApplications;
  return html`
  <article class="feed-card ${tone}" data-gig="${g.id}">
    <div class="card-header">
      <div class="card-avatar" aria-hidden="true">${g.author.initials}</div>
      <div class="card-meta">
        <div class="card-name"><a href="#/profile/${g.author.id}">${authorName(g.author)}</a> — Gig</div>
        <div class="card-sub">${industryLabel(g.industry) || 'General'} · <span class="card-time">${timeAgo(g.createdAt)}</span></div>
      </div>
      <span class="verified-badge">${g.status === 'open' ? '💼 Gig Open' : '🔒 Closed'}</span>
    </div>
    <div class="card-body"><strong>${g.title}</strong> — ${g.description}</div>
    <div class="pill-row">
      <span class="pill pill-red">💰 ${g.budget}</span>
      <span class="pill pill-green">📊 ${g.applicationCount}/${g.maxApplications} applications</span>
      <span class="pill pill-gray">${g.remote ? '🌐 Remote' : `📍 ${[g.city, g.country].filter(Boolean).join(', ') || 'On-site'}`}</span>
    </div>
    <div class="card-actions">
      ${mine
        ? html`
          <button class="action-btn" data-action="view-applications" data-id="${g.id}">👥 View applications</button>
          <button class="action-btn" data-action="toggle-gig" data-id="${g.id}" data-status="${g.status === 'open' ? 'closed' : 'open'}">${g.status === 'open' ? '🔒 Close gig' : '🔓 Reopen'}</button>`
        : g.appliedByMe
          ? html`<button class="action-btn on" disabled>✓ Applied</button>`
          : html`<button class="action-btn" data-action="apply" data-id="${g.id}" ${g.status !== 'open' || full ? 'disabled' : ''}>✋ ${full ? 'Full' : 'Apply Now'}</button>`}
      ${!mine ? html`<button class="action-btn" data-action="message" data-id="${g.author.id}">💬 Ask a question</button>` : ''}
    </div>
  </article>`;
}

export function profileCard(user, stats, { compact = true } = {}) {
  return html`
    <div class="avatar" aria-hidden="true">${user.initials}</div>
    <div class="profile-name">${user.businessName || user.name}</div>
    ${user.businessName ? html`<div class="muted">${user.name}</div>` : ''}
    <div class="profile-type">${user.accountType === 'business' ? 'Business Owner' : 'Member'}${user.verified ? ' · ✓' : ''}</div>
    <div class="profile-location">📍 ${place(user) || 'Location not set'}</div>
    ${user.streetAddress ? html`<div class="public-notice">${user.addressPublic ? '⚠️ Street address is public' : '🔒 Street address is private'}</div>` : ''}
    ${!compact && user.bio ? html`<p class="modal-text">${user.bio}</p>` : ''}
    ${stats ? html`
    <div class="profile-stats">
      <div class="stat-box"><div class="stat-num">${stats.posts}</div><div class="stat-label">Posts</div></div>
      <div class="stat-box"><div class="stat-num">${stats.likesReceived}</div><div class="stat-label">Likes</div></div>
      <div class="stat-box"><div class="stat-num">${stats.activeGigs}</div><div class="stat-label">Active Gigs</div></div>
      <div class="stat-box"><div class="stat-num">${stats.applications}</div><div class="stat-label">Applications</div></div>
    </div>` : ''}`;
}

export const empty = (msg) => html`<div class="empty">${msg}</div>`;
export const loading = () => html`<div class="loading">Loading…</div>`;
