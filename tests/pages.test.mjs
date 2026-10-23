import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, seedUsers, Browser } from './helpers.mjs';

let ctx;
before(async () => {
  ctx = await startServer();
  await seedUsers();
});
after(() => stopServer(ctx));

const ADMIN_PAGES = [
  '/dashboard',
  '/records',
  '/addRecord',
  '/customers/records',
  '/customers/register',
  '/vehicles',
  '/vehicles/register',
  '/technicians',
  '/technicians/register',
  '/registerStock/stockList',
  '/registerStock/addStock',
  '/registerStock/inventory',
  '/reports',
  '/search?q=test',
  '/signup',
  '/registerUser/userRecords',
];

test('every main page renders for an Admin and every POST form carries a CSRF token', async () => {
  const b = new Browser(ctx.baseUrl);
  await b.login('admin@test.local');

  for (const page of ADMIN_PAGES) {
    const res = await b.get(page);
    assert.equal(res.status, 200, `${page} should render (got ${res.status})`);
    const postForms = res.text.match(/<form\b[^>]*\bmethod=["']?post["']?[^>]*>/gi) || [];
    for (const form of postForms) {
      const after = res.text.slice(res.text.indexOf(form) + form.length);
      assert.ok(after.startsWith('<input type="hidden" name="_csrf"'), `${page}: form without CSRF token: ${form}`);
    }
  }
});

test('every main page renders for a Technician or redirects politely (never a server error)', async () => {
  const b = new Browser(ctx.baseUrl);
  await b.login('tech@test.local');
  for (const page of ADMIN_PAGES) {
    const res = await b.get(page);
    assert.ok([200, 302].includes(res.status), `${page} gave ${res.status} for a Technician`);
  }
});

test('logged-out visitors are sent to the login page', async () => {
  const b = new Browser(ctx.baseUrl);
  for (const page of ['/dashboard', '/records', '/vehicles', '/reports']) {
    const res = await b.get(page);
    assert.equal(res.status, 302, page);
    assert.equal(res.location, '/login', page);
  }
});
