// Test harness: boots the real app on a random port against a SEPARATE database
// (oyera_test), so development data is never touched.
process.env.DATABASE = `mongodb://localhost:27017/oyera_test_${process.pid}`; // one database per test process, so files can run in parallel
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

import session from 'express-session';
import mongoose from 'mongoose';

const { createApp } = await import('../app.mjs');
const { default: User } = await import('../models/User.mjs');

export const PASSWORD = 'Passw0rd!x';

export const startServer = async () => {
  await mongoose.connect(process.env.DATABASE);
  await mongoose.connection.dropDatabase();
  const app = createApp({ sessionStore: new session.MemoryStore() });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, server };
};

export const stopServer = async ({ server }) => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};

export const seedUsers = async () => {
  const make = (fullName, email, role) => User.create({ fullName, email, role, password: PASSWORD });
  return {
    admin: await make('Test Admin', 'admin@test.local', 'Admin'),
    senior: await make('Test Senior', 'senior@test.local', 'Senior technician'),
    tech: await make('Test Tech', 'tech@test.local', 'Technician'),
  };
};

// A tiny "browser": keeps cookies and can fill in CSRF tokens like a real form would.
export class Browser {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  async request(path, { method = 'GET', form } = {}) {
    const headers = {};
    if (this.cookies.size) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(form)) {
        for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
      }
      body = params.toString();
    }
    const res = await fetch(this.baseUrl + path, { method, headers, body, redirect: 'manual' });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    return { status: res.status, headers: res.headers, location: res.headers.get('location'), text: await res.text() };
  }

  get(path) {
    return this.request(path);
  }

  async token(fromPage) {
    const page = await this.get(fromPage);
    const match = page.text.match(/name="_csrf" value="([^"]+)"/);
    if (!match) throw new Error(`No CSRF token found on ${fromPage} (status ${page.status})`);
    return match[1];
  }

  // Loads `fromPage` to get a valid token (like opening the form), then submits it.
  async postForm(path, form, fromPage) {
    const _csrf = await this.token(fromPage);
    return this.request(path, { method: 'POST', form: { ...form, _csrf } });
  }

  async login(email, password = PASSWORD) {
    return this.postForm('/login', { identifier: email, password }, '/login');
  }
}
