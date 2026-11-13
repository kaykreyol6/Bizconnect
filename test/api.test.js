'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, registerUser, CORRECT_ANSWERS } = require('./helpers');

describe('BizConnect API', () => {
  let ctx;
  before(async () => {
    ctx = await setup();
  });
  after(async () => {
    await ctx.db.destroy();
  });

  describe('health', () => {
    test('liveness and readiness', async () => {
      await ctx.request().get('/healthz').expect(200, { status: 'ok' });
      await ctx.request().get('/readyz').expect(200, { status: 'ready' });
    });
  });

  describe('auth', () => {
    test('register → me → login → logout', async () => {
      const u = await registerUser(ctx, { email: 'Mixed.Case@Example.com' });
      assert.equal(u.user.email, 'mixed.case@example.com');
      assert.equal(u.user.addressPublic, false);
      assert.ok(!('password_hash' in u.user));

      const me = await ctx.request().get('/api/v1/auth/me').set(u.auth).expect(200);
      assert.equal(me.body.user.id, u.user.id);

      const login = await ctx.request().post('/api/v1/auth/login').send({ email: 'mixed.case@example.com', password: u.password }).expect(200);
      assert.match(String(login.headers['set-cookie']), /bc_session=.*HttpOnly/i);

      const agent = require('supertest').agent(ctx.app);
      await agent.post('/api/v1/auth/login').send({ email: 'mixed.case@example.com', password: u.password }).expect(200);
      await agent.get('/api/v1/auth/me').expect(200);
      await agent.post('/api/v1/auth/logout').expect(204);
      await agent.get('/api/v1/auth/me').expect(401);
    });

    test('rejects duplicates, bad credentials, weak passwords, bad tokens', async () => {
      const u = await registerUser(ctx);
      await ctx.request().post('/api/v1/auth/register').send({ email: u.user.email, password: 'whatever-123', name: 'Dup' }).expect(409);
      await ctx.request().post('/api/v1/auth/login').send({ email: u.user.email, password: 'wrong-password' }).expect(401);
      await ctx.request().post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password' }).expect(401);
      const weak = await ctx.request().post('/api/v1/auth/register').send({ email: 'weak@example.com', password: 'short', name: 'Weak' }).expect(400);
      assert.equal(weak.body.error.details[0].path, 'password');
      await ctx.request().get('/api/v1/auth/me').set({ Authorization: 'Bearer not.a.jwt' }).expect(401);
    });

    test('business accounts require a business name', async () => {
      await ctx.request().post('/api/v1/auth/register').send({ email: 'biz@example.com', password: 'long-enough-pw', name: 'Biz Owner', accountType: 'business' }).expect(400);
    });

    test('mutations must be JSON (CSRF defence)', async () => {
      await ctx.request().post('/api/v1/auth/login').type('form').send('email=a@b.co&password=x').expect(415);
    });
  });

  describe('profiles & privacy', () => {
    test('street address is private unless opted in', async () => {
      const u = await registerUser(ctx);
      const viewer = await registerUser(ctx);
      await ctx.request().patch('/api/v1/users/me').set(u.auth).send({ streetAddress: '1 Secret Lane' }).expect(200);

      let pub = await ctx.request().get(`/api/v1/users/${u.user.id}`).set(viewer.auth).expect(200);
      assert.equal(pub.body.user.streetAddress, null);
      assert.equal(pub.body.user.email, undefined);

      const self = await ctx.request().get(`/api/v1/users/${u.user.id}`).set(u.auth).expect(200);
      assert.equal(self.body.user.streetAddress, '1 Secret Lane');

      await ctx.request().patch('/api/v1/users/me').set(u.auth).send({ addressPublic: true }).expect(200);
      pub = await ctx.request().get(`/api/v1/users/${u.user.id}`).set(viewer.auth).expect(200);
      assert.equal(pub.body.user.streetAddress, '1 Secret Lane');
      assert.deepEqual(Object.keys(pub.body.stats).sort(), ['activeGigs', 'applications', 'likesReceived', 'posts']);
    });

    test('rejects unknown profile fields', async () => {
      const u = await registerUser(ctx);
      await ctx.request().patch('/api/v1/users/me').set(u.auth).send({ verified: true }).expect(400);
    });

    test('business directory filters by industry and search', async () => {
      await registerUser(ctx, { accountType: 'business', businessName: 'Acme Farming Co', industry: 'agriculture' });
      await registerUser(ctx, { accountType: 'business', businessName: 'Zeta Bank', industry: 'finance' });
      const agri = await ctx.request().get('/api/v1/businesses?industry=agriculture').expect(200);
      assert.ok(agri.body.items.every((b) => b.industry === 'agriculture'));
      assert.ok(agri.body.items.some((b) => b.businessName === 'Acme Farming Co'));
      const search = await ctx.request().get('/api/v1/businesses?q=zeta').expect(200);
      assert.equal(search.body.items.length, 1);
      assert.equal(search.body.items[0].openGigs, 0);
      // LIKE wildcards are escaped
      const wildcard = await ctx.request().get('/api/v1/businesses?q=%25').expect(200);
      assert.equal(wildcard.body.items.length, 0);
    });
  });

  describe('posts', () => {
    test('create, feed, like idempotency, comments, delete', async () => {
      const a = await registerUser(ctx);
      const b = await registerUser(ctx);
      const created = await ctx.request().post('/api/v1/posts').set(a.auth).send({ body: 'Hello world' }).expect(201);
      const id = created.body.post.id;
      assert.equal(created.body.post.country, 'Kenya'); // defaults from profile

      await ctx.request().put(`/api/v1/posts/${id}/like`).set(b.auth).expect(200);
      const liked = await ctx.request().put(`/api/v1/posts/${id}/like`).set(b.auth).expect(200);
      assert.equal(liked.body.post.likeCount, 1);
      assert.equal(liked.body.post.likedByMe, true);

      const unliked = await ctx.request().delete(`/api/v1/posts/${id}/like`).set(b.auth).expect(200);
      assert.equal(unliked.body.post.likeCount, 0);
      await ctx.request().delete(`/api/v1/posts/${id}/like`).set(b.auth).expect(200);

      await ctx.request().post(`/api/v1/posts/${id}/comments`).set(b.auth).send({ body: 'Nice!' }).expect(201);
      const comments = await ctx.request().get(`/api/v1/posts/${id}/comments`).expect(200);
      assert.equal(comments.body.items[0].body, 'Nice!');

      const feed = await ctx.request().get('/api/v1/posts').set(b.auth).expect(200);
      const inFeed = feed.body.items.find((p) => p.id === id);
      assert.equal(inFeed.commentCount, 1);

      await ctx.request().delete(`/api/v1/posts/${id}`).set(b.auth).expect(403);
      await ctx.request().delete(`/api/v1/posts/${id}`).set(a.auth).expect(204);
      await ctx.request().get(`/api/v1/posts/${id}/comments`).expect(200, { items: [], nextCursor: null });
    });

    test('bargains need a price; type filter works', async () => {
      const a = await registerUser(ctx);
      await ctx.request().post('/api/v1/posts').set(a.auth).send({ type: 'bargain', body: 'Cheap' }).expect(400);
      await ctx.request()
        .post('/api/v1/posts')
        .set(a.auth)
        .send({ type: 'bargain', body: 'Cheap rice', price: { amountCents: 1999, currency: 'usd' } })
        .expect(201);
      const res = await ctx.request().get('/api/v1/posts?type=bargain').expect(200);
      assert.ok(res.body.items.length >= 1);
      assert.ok(res.body.items.every((p) => p.type === 'bargain'));
      assert.equal(res.body.items[0].price.currency, 'USD');
    });

    test('keyset pagination walks every post exactly once', async () => {
      const a = await registerUser(ctx);
      for (let i = 0; i < 7; i++) {
        await ctx.request().post('/api/v1/posts').set(a.auth).send({ body: `page test ${i}` }).expect(201);
      }
      const seen = [];
      let cursor = null;
      do {
        const res = await ctx.request().get(`/api/v1/posts?author=${a.user.id}&limit=3${cursor ? `&cursor=${cursor}` : ''}`).expect(200);
        seen.push(...res.body.items.map((p) => p.id));
        cursor = res.body.nextCursor;
      } while (cursor);
      assert.equal(seen.length, 7);
      assert.equal(new Set(seen).size, 7);
      assert.deepEqual(seen, [...seen].sort((x, y) => y - x));
    });

    test('regional scope filters by the viewer country', async () => {
      const ke = await registerUser(ctx, { country: 'Ghana' });
      const fr = await registerUser(ctx, { country: 'France' });
      await ctx.request().post('/api/v1/posts').set(ke.auth).send({ body: 'Accra update' }).expect(201);
      await ctx.request().post('/api/v1/posts').set(fr.auth).send({ body: 'Paris update' }).expect(201);
      const res = await ctx.request().get('/api/v1/posts?scope=regional').set(ke.auth).expect(200);
      assert.ok(res.body.items.length >= 1);
      assert.ok(res.body.items.every((p) => p.country === 'Ghana'));
      await ctx.request().get('/api/v1/posts?scope=regional').expect(400);
    });

    test('limit is capped', async () => {
      await ctx.request().get('/api/v1/posts?limit=500').expect(400);
    });
  });

  describe('compliance & gigs', () => {
    test('quiz excludes answers; failing quiz is rejected; passing issues certificate', async () => {
      const u = await registerUser(ctx);
      const regs = await ctx.request().get('/api/v1/compliance/regulations').expect(200);
      assert.equal(regs.body.quiz.length, 5);
      assert.ok(regs.body.quiz.every((q) => !('answer' in q)));

      const status0 = await ctx.request().get('/api/v1/compliance/status').set(u.auth).expect(200);
      assert.equal(status0.body.signed, false);

      const fail = await ctx.request()
        .post('/api/v1/compliance/sign')
        .set(u.auth)
        .send({ answers: [0, 0, 0, 0, 0], signedName: 'User', consent: true })
        .expect(422);
      assert.equal(fail.body.error.code, 'QUIZ_FAILED');

      await ctx.request().post('/api/v1/compliance/sign').set(u.auth).send({ answers: CORRECT_ANSWERS, signedName: 'User' }).expect(400);

      const ok = await ctx.request()
        .post('/api/v1/compliance/sign')
        .set(u.auth)
        .send({ answers: CORRECT_ANSWERS, signedName: 'User Name', consent: true })
        .expect(201);
      assert.match(ok.body.agreement.certificateId, /^BC-\d{4}-INT-[0-9A-F]{10}$/);
      assert.equal(ok.body.agreement.quizScore, 100);

      const status1 = await ctx.request().get('/api/v1/compliance/status').set(u.auth).expect(200);
      assert.equal(status1.body.signed, true);
    });

    test('gig lifecycle: compliance gate, apply once, capacity, owner-only views', async () => {
      const owner = await registerUser(ctx);
      const worker = await registerUser(ctx);
      const other = await registerUser(ctx);
      const gig = await ctx.request()
        .post('/api/v1/gigs')
        .set(owner.auth)
        .send({ title: 'Translator', description: 'Translate some documents please', budget: '$50/h', maxApplications: 1, remote: true })
        .expect(201);
      const id = gig.body.gig.id;

      await ctx.request().post(`/api/v1/gigs/${id}/apply`).set(owner.auth).send({}).expect(403);
      const gated = await ctx.request().post(`/api/v1/gigs/${id}/apply`).set(worker.auth).send({}).expect(403);
      assert.equal(gated.body.error.code, 'COMPLIANCE_REQUIRED');

      for (const u of [worker, other]) {
        await ctx.request().post('/api/v1/compliance/sign').set(u.auth).send({ answers: CORRECT_ANSWERS, signedName: u.user.name, consent: true }).expect(201);
      }
      const applied = await ctx.request().post(`/api/v1/gigs/${id}/apply`).set(worker.auth).send({ message: 'Pick me' }).expect(201);
      assert.equal(applied.body.gig.applicationCount, 1);
      assert.equal(applied.body.gig.appliedByMe, true);

      await ctx.request().post(`/api/v1/gigs/${id}/apply`).set(worker.auth).send({}).expect(409);
      const full = await ctx.request().post(`/api/v1/gigs/${id}/apply`).set(other.auth).send({}).expect(409);
      assert.match(full.body.error.message, /no longer accepting/);

      const mine = await ctx.request().get('/api/v1/me/applications').set(worker.auth).expect(200);
      assert.equal(mine.body.items[0].gig.id, id);

      await ctx.request().get(`/api/v1/gigs/${id}/applications`).set(worker.auth).expect(403);
      const apps = await ctx.request().get(`/api/v1/gigs/${id}/applications`).set(owner.auth).expect(200);
      assert.equal(apps.body.items[0].message, 'Pick me');

      await ctx.request().patch(`/api/v1/gigs/${id}`).set(worker.auth).send({ status: 'closed' }).expect(403);
      await ctx.request().patch(`/api/v1/gigs/${id}`).set(owner.auth).send({ status: 'closed' }).expect(200);
      const open = await ctx.request().get('/api/v1/gigs').expect(200);
      assert.ok(!open.body.items.some((g) => g.id === id));
    });
  });

  describe('messages', () => {
    test('send, list conversations with unread counts, read thread', async () => {
      const a = await registerUser(ctx);
      const b = await registerUser(ctx);
      await ctx.request().post('/api/v1/messages').set(a.auth).send({ recipientId: a.user.id, body: 'me' }).expect(400);
      await ctx.request().post('/api/v1/messages').set(a.auth).send({ recipientId: 999999, body: 'x' }).expect(404);
      await ctx.request().post('/api/v1/messages').set(a.auth).send({ recipientId: b.user.id, body: 'Hi B' }).expect(201);
      await ctx.request().post('/api/v1/messages').set(a.auth).send({ recipientId: b.user.id, body: 'Are you there?' }).expect(201);

      let convos = await ctx.request().get('/api/v1/messages/conversations').set(b.auth).expect(200);
      assert.equal(convos.body.items.length, 1);
      assert.equal(convos.body.items[0].user.id, a.user.id);
      assert.equal(convos.body.items[0].unread, 2);
      assert.equal(convos.body.items[0].lastMessage.body, 'Are you there?');

      const thread = await ctx.request().get(`/api/v1/messages/with/${a.user.id}`).set(b.auth).expect(200);
      assert.equal(thread.body.items.length, 2);

      convos = await ctx.request().get('/api/v1/messages/conversations').set(b.auth).expect(200);
      assert.equal(convos.body.items[0].unread, 0);
      await ctx.request().get('/api/v1/messages/conversations').expect(401);
    });
  });

  describe('misc', () => {
    test('unknown API routes return JSON 404; SPA fallback serves HTML', async () => {
      const res = await ctx.request().get('/api/v1/nope').expect(404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
      const page = await ctx.request().get('/gigs').expect(200);
      assert.match(page.headers['content-type'], /html/);
    });

    test('security headers are set', async () => {
      const res = await ctx.request().get('/api/v1/meta/industries').expect(200);
      assert.ok(res.headers['content-security-policy']);
      assert.equal(res.headers['x-powered-by'], undefined);
      assert.ok(res.headers['x-request-id']);
      assert.equal(res.body.items.length, 12);
    });

    test('malformed JSON returns 400', async () => {
      const res = await ctx.request().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad').expect(400);
      assert.equal(res.body.error.code, 'BAD_JSON');
    });
  });
});
