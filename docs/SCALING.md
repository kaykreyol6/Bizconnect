# BizConnect — Scaling & Hardening Recommendations

This document lists what was **applied** in this codebase to make BizConnect
scale, and what to do **next** as traffic grows. Recommendations are ordered
by impact-per-effort.

## Starting point

The original repo was a single 1,200-line `index.html` mockup: hardcoded
users and posts, `alert()` stubs, no backend, no persistence, no auth. The
mockup also *forced every user's street address to be public*, which conflicts
with GDPR data-minimisation — the same regulation the platform asks users to
sign.

---

## ✅ Applied

### Architecture
| # | Recommendation | Where |
|---|---|---|
| 1 | **Separate API from client.** Versioned REST API under `/api/v1`; static client in `public/` with no build step. The API can be used by mobile apps or a future SPA framework unchanged. | `server/app.js`, `public/` |
| 2 | **Stateless app servers.** Auth is a signed JWT (httpOnly cookie for browsers, `Authorization: Bearer` for API clients). No in-process sessions, so any instance can serve any request → scale horizontally behind a load balancer. | `server/middleware/auth.js` |
| 3 | **Portable data layer.** Knex query builder + versioned migrations run on **SQLite** (zero-setup dev/test) and **PostgreSQL** (production). The full test suite and the browser end-to-end flow both pass on each. | `server/db/` |
| 4 | **12-factor config.** Everything is configured by env vars; production refuses to boot without a strong `JWT_SECRET`. | `server/config.js`, `.env.example` |

### Database performance
| # | Recommendation | Where |
|---|---|---|
| 5 | **Keyset (cursor) pagination** on every list endpoint instead of `OFFSET`. Cost is O(page size) at any depth, and pages don't shift when new rows arrive. `limit` is capped at 50. | `server/lib/pagination.js` |
| 6 | **Composite indexes matching each hot query** (e.g. `posts(type,id)`, `posts(country,id)`, `gigs(status,id)`, `messages(recipient_id,id)`, `users(account_type,industry,id)`). | migration |
| 7 | **Denormalised counters** (`like_count`, `comment_count`, `application_count`) updated in the same transaction as the source row, so feeds never run `COUNT(*)` per item. | `server/routes/posts.js`, `gigs.js` |
| 8 | **Race-free capacity checks.** Gig applications use a single conditional `UPDATE … WHERE application_count < max_applications`; likes rely on a primary key for idempotency. No read-then-write races under concurrency. | `server/routes/gigs.js` |
| 9 | **No N+1 queries.** Author data is joined; "liked by me" / "applied by me" are `EXISTS` subqueries; directory gig counts are one grouped query per page. | routes |
| 10 | **Connection pooling** with a configurable `DB_POOL_MAX`. | `server/db/knex.js` |

### Reliability & operations
| # | Recommendation | Where |
|---|---|---|
| 11 | **Health probes:** `/healthz` (liveness) and `/readyz` (checks the DB and fails during shutdown so the load balancer drains the instance). | `server/routes/health.js` |
| 12 | **Graceful shutdown** on SIGTERM: fail readiness, stop accepting connections, finish in-flight requests, close the pool. Keep-alive timeouts are tuned above typical LB idle timeouts to avoid 502s. | `server/index.js` |
| 13 | **Structured JSON logs** (pino) with a per-request ID (honours an incoming `X-Request-Id`), lean serializers, and redaction of cookies and auth headers. | `server/app.js`, `server/logger.js` |
| 14 | **Container image:** multi-stage, non-root, `HEALTHCHECK`, exec-form CMD so signals reach Node. | `Dockerfile` |
| 15 | **Reference topology:** Postgres + one-off migration job + 2 API replicas + nginx LB. | `docker-compose.yml`, `deploy/nginx.conf` |
| 16 | **CI:** tests on both SQLite and Postgres, plus a Docker build. | `.github/workflows/ci.yml` |
| 17 | **HTTP caching:** gzip compression; `index.html` revalidated on every load (instant deploys); CSS/JS cached with ETags; reference data (`/meta/industries`, regulations) is publicly cacheable; personalised API responses are `no-store`. | `server/app.js` |

### Security & privacy
| # | Recommendation | Where |
|---|---|---|
| 18 | **Privacy by default:** street address hidden unless the user opts in; email never exposed publicly. The compliance quiz was updated to match. | `server/lib/serialize.js` |
| 19 | **Strict CSP** (`script-src 'self'`, no inline handlers — the client uses event delegation) plus helmet's security headers; HSTS in production. | `server/app.js`, `public/js/app.js` |
| 20 | **XSS-safe templating:** every interpolated value is escaped by the `html` tagged template. | `public/js/dom.js` |
| 21 | **CSRF defence-in-depth:** `SameSite=Lax` cookies plus JSON-only mutations (415 otherwise). | `server/app.js` |
| 22 | **Rate limiting:** global per-IP API limit, plus a stricter limit that counts failed login and registration attempts only. | `server/app.js` |
| 23 | **Input validation** with zod on every body and query (strict schemas reject unknown fields such as `verified`). | routes |
| 24 | **bcrypt password hashing**, comparison against a dummy hash for unknown emails (resists user enumeration), and pseudonymised (HMAC) IPs on signature records. | `routes/auth.js`, `routes/compliance.js` |
| 25 | **Server-side compliance gate:** the quiz is graded on the server (answers never reach the client), and applying to a gig returns `403 COMPLIANCE_REQUIRED` without a valid agreement. | `routes/compliance.js`, `routes/gigs.js` |

---

## ⏭️ Next steps (as traffic grows)

1. **Shared rate-limit store (Redis).** The rate limiter is in-memory per
   instance today. With N replicas the effective limit is N×. Plug
   `rate-limit-redis` into `express-rate-limit`; this is a one-line change in
   `server/app.js`.
2. **CDN in front of static assets.** Serve `public/` from a CDN (CloudFront,
   Cloudflare, Fastly). Add content-hashed filenames (a small build step) so
   assets can be cached as `immutable` for a year.
3. **Real-time messaging.** The client polls unread counts every 30 seconds,
   only while the tab is visible. Move to Server-Sent Events or WebSockets,
   fanned out across instances through Redis pub/sub or Postgres
   `LISTEN/NOTIFY`.
4. **Read replicas.** Feeds, directories and gig lists are read-heavy. Route
   `GET` queries to a Postgres read replica (a second Knex instance) once the
   primary's CPU becomes the bottleneck.
5. **Full-text search.** Business search uses `lower(...) LIKE`. Add a Postgres
   `pg_trgm` GIN index or `tsvector` column, or move to OpenSearch or
   Meilisearch when the directory reaches hundreds of thousands of rows.
6. **Feed fan-out and caching.** If "following" or personalised feeds are
   added, precompute per-user timelines (fan-out on write) for typical users
   and fan out on read for very large accounts; cache hot pages in Redis.
7. **Background jobs.** Emailing signed certificates, notifications and
   counter reconciliation belong in a queue (BullMQ or pg-boss) rather than
   on the request path.
8. **Token revocation.** JWTs are stateless (good for scale), but logout only
   clears the cookie. Add short-lived access tokens with rotating refresh
   tokens, or a Redis deny-list keyed on `jti`, for forced logout and password
   changes.
9. **Partitioning and retention.** Partition `messages` and `post_likes` by
   time once they reach hundreds of millions of rows; archive old partitions.
10. **Observability.** Export OpenTelemetry traces and RED metrics (rate,
    errors, duration) per route. Alert on `/readyz` failures, p95 latency and
    DB pool saturation.
11. **Legally robust e-signatures.** The current flow records name,
    timestamp, quiz score and pseudonymised IP. For contracts that must hold
    up across jurisdictions, integrate a qualified provider (DocuSign or
    Adobe Sign) and have counsel review the regulation texts.
12. **Internationalisation.** The profile stores a preferred language. The UI
    strings still need extracting into message catalogs, with RTL layout
    support for Arabic.
