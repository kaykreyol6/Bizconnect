'use strict';

const bool = (v) => v === true || v === 1 || v === '1';
// SQLite returns 'YYYY-MM-DD HH:MM:SS' (UTC) or ISO strings; Postgres returns Date objects.
const iso = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`).toISOString();
};

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

/** Public view of a user — never leaks email, hash, or a private street address. */
function publicUser(u, { self = false } = {}) {
  if (!u) return null;
  const addressPublic = bool(u.address_public);
  const out = {
    id: u.id,
    name: u.name,
    initials: initials(u.business_name || u.name),
    accountType: u.account_type,
    businessName: u.business_name || null,
    industry: u.industry || null,
    country: u.country || null,
    region: u.region || null,
    city: u.city || null,
    streetAddress: addressPublic || self ? u.street_address || null : null,
    addressPublic,
    language: u.language,
    bio: u.bio || null,
    verified: bool(u.verified),
    createdAt: iso(u.created_at),
  };
  if (self) out.email = u.email;
  return out;
}

/** Rows joined with author columns prefixed `a_`. */
function authorFrom(row) {
  return {
    id: row.author_id,
    name: row.a_name,
    initials: initials(row.a_business_name || row.a_name),
    businessName: row.a_business_name || null,
    accountType: row.a_account_type,
    industry: row.a_industry || null,
    verified: bool(row.a_verified),
  };
}

const authorColumns = [
  'u.name as a_name',
  'u.business_name as a_business_name',
  'u.account_type as a_account_type',
  'u.industry as a_industry',
  'u.verified as a_verified',
];

function post(row) {
  return {
    id: row.id,
    type: row.type,
    body: row.body,
    price: row.price_cents == null ? null : { amountCents: row.price_cents, currency: row.currency },
    country: row.country || null,
    city: row.city || null,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    likedByMe: bool(row.liked_by_me),
    createdAt: iso(row.created_at),
    author: authorFrom(row),
  };
}

function comment(row) {
  return { id: row.id, postId: row.post_id, body: row.body, createdAt: iso(row.created_at), author: authorFrom(row) };
}

function gig(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    budget: row.budget,
    industry: row.industry || null,
    remote: bool(row.remote),
    country: row.country || null,
    city: row.city || null,
    maxApplications: row.max_applications,
    applicationCount: row.application_count,
    status: row.status,
    appliedByMe: bool(row.applied_by_me),
    createdAt: iso(row.created_at),
    author: authorFrom(row),
  };
}

function agreement(row) {
  return {
    id: row.id,
    version: row.version,
    certificateId: row.certificate_id,
    signedName: row.signed_name,
    quizScore: row.quiz_score,
    jurisdiction: row.jurisdiction,
    signedAt: iso(row.signed_at),
    expiresAt: iso(row.expires_at),
  };
}

function message(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body,
    readAt: iso(row.read_at),
    createdAt: iso(row.created_at),
  };
}

module.exports = { publicUser, post, comment, gig, agreement, message, authorColumns, initials, bool, iso };
