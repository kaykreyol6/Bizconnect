# BizConnect

A global business & social platform: a feed of business updates and **bargains**,
a **gigs** marketplace, a **business directory** by industry, direct
**messaging**, and an **international regulations agreement** (read → quiz →
e-sign) that gates contractual actions.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000 — auto-migrates SQLite and seeds demo data
```

Demo login: **jane@demo.bizconnect** / **demo-password** (every seeded account uses the same password).

## Production-like stack (Postgres + 2 replicas + nginx)

```bash
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))") docker compose up --build
# → http://localhost:8080 ; optional demo data:
docker compose run --rm migrate node server/db/cli.js seed
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with file watching (SQLite, auto-migrate, demo seed) |
| `npm start` | Start the server |
| `npm run migrate` | Apply DB migrations (`DATABASE_URL` → Postgres, otherwise SQLite) |
| `npm run seed` | Reset and load demo data |
| `npm test` | API integration tests (in-memory SQLite; set `DATABASE_URL` to run against Postgres) |

Configuration is environment-driven; see [`.env.example`](.env.example).

## Architecture

```
public/            Static web client — vanilla ES modules, no build step
  index.html       App shell
  css/styles.css   Design system (red/white/gold), responsive + a11y modes
  js/app.js        Router, event delegation, forms
  js/views.js      Pages: feed, businesses, gigs, bargains, contracts, messages, profile, settings
  js/components.js Post / gig / business cards
  js/compliance.js 4-step regulations agreement flow
  js/dom.js        XSS-safe `html` tagged templates
server/
  index.js         Boot, graceful shutdown
  app.js           Express app: security headers, logging, rate limits, routes, static
  config.js        Env config
  db/              Knex setup, migrations, demo seed, CLI
  middleware/      Auth (JWT), validation (zod), errors
  routes/          auth, users/businesses, posts, gigs, compliance, messages, meta, health
  lib/             Pagination, serializers, catalog (industries, regulations, quiz)
test/              node:test + supertest API tests
docs/SCALING.md    Scaling recommendations — applied and next steps
```

## API overview (`/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Users | `GET /users/:id`, `PATCH /users/me`, `GET /businesses?industry=&country=&q=` |
| Posts | `GET /posts?type=&scope=regional&author=`, `POST /posts`, `DELETE /posts/:id`, `PUT/DELETE /posts/:id/like`, `GET/POST /posts/:id/comments` |
| Gigs | `GET /gigs?status=&industry=&remote=&author=`, `POST /gigs`, `GET/PATCH /gigs/:id`, `POST /gigs/:id/apply`, `GET /gigs/:id/applications`, `GET /me/applications` |
| Compliance | `GET /compliance/regulations`, `GET /compliance/status`, `GET /compliance/agreements`, `POST /compliance/sign` |
| Messages | `GET /messages/conversations`, `GET /messages/with/:userId`, `POST /messages` |
| Meta | `GET /meta/industries` |
| Health | `GET /healthz`, `GET /readyz` (outside `/api`) |

Lists return `{ items, nextCursor }`; pass `?cursor=<nextCursor>` to get the next page.
Errors return `{ error: { code, message, details? } }`.

## Scaling

See **[docs/SCALING.md](docs/SCALING.md)** for the 25 scaling, reliability and
security measures applied and the roadmap for growing traffic.
