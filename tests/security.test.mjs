import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, seedUsers, Browser, PASSWORD } from './helpers.mjs';
import { injectCsrfToken } from '../middleware/csrf.mjs';
import User from '../models/User.mjs';

let ctx;
before(async () => {
  ctx = await startServer();
  await seedUsers();
});
after(() => stopServer(ctx));

test('CSRF: token is added to POST forms only', () => {
  const html = '<form method="POST" action="/a"><input></form><form method="get" action="/b"></form>';
  const out = injectCsrfToken(html, 'TOK');
  assert.match(out, /<form method="POST" action="\/a"><input type="hidden" name="_csrf" value="TOK">/);
  assert.doesNotMatch(out, /action="\/b"><input type="hidden"/);
});

test('login page renders with a CSRF token, security headers and a safe cookie', async () => {
  const b = new Browser(ctx.baseUrl);
  const res = await b.get('/login');
  assert.equal(res.status, 200);
  assert.match(res.text, /name="_csrf" value="[0-9a-f]{64}"/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('oyera.sid='));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test('CSRF: a POST without a token is rejected with 403', async () => {
  const b = new Browser(ctx.baseUrl);
  await b.get('/login');
  const res = await b.request('/login', { method: 'POST', form: { identifier: 'admin@test.local', password: PASSWORD } });
  assert.equal(res.status, 403);
  assert.match(res.text, /session expired|invalid/i);
});

test('CSRF: a POST with a wrong token is rejected with 403', async () => {
  const b = new Browser(ctx.baseUrl);
  await b.get('/login');
  const res = await b.request('/login', { method: 'POST', form: { identifier: 'admin@test.local', password: PASSWORD, _csrf: 'nope' } });
  assert.equal(res.status, 403);
});

test('login: wrong password gives 401, correct password redirects to the dashboard', async () => {
  const b = new Browser(ctx.baseUrl);
  const bad = await b.login('admin@test.local', 'WrongPass1!');
  assert.equal(bad.status, 401);
  const ok = await b.login('admin@test.local');
  assert.equal(ok.status, 302);
  assert.equal(ok.location, '/dashboard');
});

test('login: the session id changes after logging in (session fixation protection)', async () => {
  const b = new Browser(ctx.baseUrl);
  await b.get('/login');
  const sidBefore = b.cookies.get('oyera.sid');
  await b.login('tech@test.local');
  assert.notEqual(b.cookies.get('oyera.sid'), sidBefore);
});

test('unknown URLs show the friendly 404 page', async () => {
  const res = await new Browser(ctx.baseUrl).get('/no-such-page');
  assert.equal(res.status, 404);
  assert.match(res.text, /That page does not exist/);
});

test('roles: only Admin can open the register-technician page', async () => {
  const roles = { 'tech@test.local': 302, 'senior@test.local': 302, 'admin@test.local': 200 };
  for (const [email, expected] of Object.entries(roles)) {
    const b = new Browser(ctx.baseUrl);
    await b.login(email);
    const res = await b.get('/technicians/register');
    assert.equal(res.status, expected, `${email} should get ${expected}`);
  }
});

test('roles: a Technician cannot create technicians by POSTing directly', async () => {
  const b = new Browser(ctx.baseUrl);
  await b.login('tech@test.local');
  const res = await b.postForm(
    '/technicians/register',
    { fullName: 'Sneaky Person', identifier: 'sneaky@test.local', password: 'Passw0rd!x', role: 'Senior technician' },
    '/login',
  );
  assert.equal(res.status, 302);
  assert.equal(await User.countDocuments({ email: 'sneaky@test.local' }), 0);
});

test('roles: customer pages are for Admin and Senior technician only', async () => {
  const expected = { 'tech@test.local': 302, 'senior@test.local': 200, 'admin@test.local': 200 };
  for (const [email, status] of Object.entries(expected)) {
    const b = new Browser(ctx.baseUrl);
    await b.login(email);
    assert.equal((await b.get('/customers/records')).status, status, email);
  }
});

test('an Admin cannot delete their own account', async () => {
  const admin = await User.findOne({ email: 'admin@test.local' });
  const b = new Browser(ctx.baseUrl);
  await b.login('admin@test.local');
  const res = await b.postForm(`/registerUser/user/delete/${admin._id}`, {}, '/login');
  assert.equal(res.status, 302);
  assert.equal(await User.countDocuments({ _id: admin._id }), 1);
});

// Keep this last: the limiter is shared by the whole process.
test('rate limit: repeated failed logins are blocked with 429', async () => {
  const b = new Browser(ctx.baseUrl);
  let blocked = null;
  for (let i = 1; i <= 15 && !blocked; i++) {
    const res = await b.login('admin@test.local', 'WrongPass1!');
    if (res.status === 429) blocked = i;
  }
  assert.ok(blocked && blocked > 5, `expected a 429 after several attempts, got ${blocked}`);
});
