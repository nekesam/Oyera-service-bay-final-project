import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, seedUsers, Browser } from './helpers.mjs';
import Customers from '../models/Customers.mjs';
import Vehicle from '../models/Vehicle.mjs';
import Stock from '../models/Stock.mjs';
import ServiceRecord from '../models/ServiceRecord.mjs';
import AuditLog from '../models/AuditLog.mjs';
import { amountPaid, balanceDue, paymentStatus, jobStatus } from '../services/billing.mjs';
import { toCsv } from '../services/csv.mjs';
import { paginate } from '../utils/paginate.mjs';
import { clearNotificationCache } from '../services/notificationService.mjs';
import { isLowStock } from '../services/inventoryService.mjs';

// ---------- pure logic ----------

test('billing: paid / part paid / unpaid are worked out from the payments list', () => {
  const job = (total, ...payments) => ({ totalCost: total, payments: payments.map((amount) => ({ amount })) });
  assert.equal(paymentStatus(job(100)), 'Unpaid');
  assert.equal(paymentStatus(job(100, 40)), 'Part paid');
  assert.equal(paymentStatus(job(100, 40, 60)), 'Paid');
  assert.equal(amountPaid(job(100, 40, 10)), 50);
  assert.equal(balanceDue(job(100, 40)), 60);
  assert.equal(jobStatus({}), 'Collected', 'old jobs without a status count as collected');
  assert.equal(jobStatus({ status: 'Booked' }), 'Booked');
});

test('csv: quotes commas and blocks spreadsheet formulas', () => {
  const csv = toCsv([{ a: 'Hello, "World"', b: '=SUM(A1)' }, { a: '+1', b: 'ok' }], [
    { header: 'A', value: (r) => r.a },
    { header: 'B', value: (r) => r.b },
  ]);
  assert.match(csv, /^﻿A,B\r\n"Hello, ""World""",'=SUM\(A1\)\r\n'\+1,ok\r\n$/);
});

test('pagination: pages, clamping and the "showing x to y" numbers', () => {
  const p = paginate({ page: '2' }, 45, 20);
  assert.deepEqual([p.page, p.totalPages, p.skip, p.from, p.to, p.hasPrev, p.hasNext], [2, 3, 20, 21, 40, true, true]);
  assert.equal(paginate({ page: '99' }, 45, 20).page, 3);
  assert.equal(paginate({ page: 'abc' }, 45, 20).page, 1);
  assert.deepEqual([paginate({}, 0).from, paginate({}, 0).to, paginate({}, 0).totalPages], [0, 0, 1]);
});

test('low stock: uses the item reorder level, or the shop threshold when it has none', () => {
  assert.equal(isLowStock({ quantity: 5 }), true);
  assert.equal(isLowStock({ quantity: 6 }), false);
  assert.equal(isLowStock({ quantity: 8, reorderLevel: 10 }), true);
  assert.equal(isLowStock({ quantity: 2, reorderLevel: 1 }), false);
});

// ---------- with the real app and database ----------

let ctx, users, admin, senior, tech;
let customer, vehicle, filter;

before(async () => {
  ctx = await startServer();
  users = await seedUsers();
  admin = new Browser(ctx.baseUrl);
  senior = new Browser(ctx.baseUrl);
  tech = new Browser(ctx.baseUrl);
  await admin.login('admin@test.local');
  await senior.login('senior@test.local');
  await tech.login('tech@test.local');
});
after(() => stopServer(ctx));

beforeEach(async () => {
  await Promise.all([Customers.deleteMany({}), Vehicle.deleteMany({}), Stock.deleteMany({}), ServiceRecord.deleteMany({}), AuditLog.deleteMany({})]);
  clearNotificationCache();
  customer = await Customers.create({ firstName: 'Cara', lastName: 'Client', phone: '0700000001' });
  vehicle = await Vehicle.create({ customerId: customer._id, vehicleName: 'Corolla', registrationNo: 'UAX 456B', ownerName: 'Cara Client', vehicleType: 'small' });
  filter = await Stock.create({ stockId: 'F-1', itemName: 'Oil Filter Premium', category: 'Oil Filter', quantity: 50, unitPrice: 18000 });
});

const job = (overrides = {}) => ({
  customer: String(customer._id),
  vehicle: String(vehicle._id),
  servicesDone: ['Wheel Alignment'],
  technicians: [String(users.tech._id)],
  partIds: [String(filter._id)],
  partQuantities: ['2'],
  ...overrides,
});

// direct database helper for tests that need lots of records quickly
const makeRecord = (overrides = {}) =>
  ServiceRecord.create({
    customer: customer._id,
    vehicle: vehicle._id,
    servicesDone: ['Greasing'],
    technicians: [users.tech._id],
    totalCost: 100000,
    status: 'In progress',
    ...overrides,
  });

test('a new job starts "In progress" and updates the vehicle\'s last service date', async () => {
  await admin.postForm('/addRecord', job(), '/addRecord');
  const record = await ServiceRecord.findOne();
  assert.equal(record.status, 'In progress');
  const car = await Vehicle.findById(vehicle._id);
  assert.ok(car.lastService, 'lastService should be set');
  assert.equal(new Date(car.lastService).getTime(), new Date(record.date).getTime());
});

test('deleting the newest job moves the last service date back to the previous job', async () => {
  const older = await makeRecord({ date: new Date('2026-01-10') });
  const newer = await makeRecord({ date: new Date('2026-03-10') });
  await Vehicle.updateOne({ _id: vehicle._id }, { lastService: newer.date });
  await admin.postForm(`/records/delete/${newer._id}`, {}, '/login');
  assert.equal(new Date((await Vehicle.findById(vehicle._id)).lastService).toISOString(), older.date.toISOString());
});

test('records list: search, status filter, payment filter and old jobs without a status', async () => {
  const other = await Customers.create({ firstName: 'Omar', lastName: 'Other', phone: '0700000002' });
  const otherCar = await Vehicle.create({ customerId: other._id, vehicleName: 'Hilux', registrationNo: 'UBB 111C', ownerName: 'Omar Other', vehicleType: 'commercial' });
  await makeRecord();
  await makeRecord({ customer: other._id, vehicle: otherCar._id, status: 'Ready for pickup', payments: [{ amount: 100000, method: 'Cash' }] });
  await ServiceRecord.collection.insertOne({ customer: customer._id, vehicle: vehicle._id, servicesDone: ['Greasing'], technicians: [users.tech._id], totalCost: 5000, date: new Date() }); // legacy

  const names = (html) => ['Cara Client', 'Omar Other'].filter((n) => html.includes(n));
  assert.deepEqual(names((await admin.get('/records?q=omar')).text), ['Omar Other']);
  assert.deepEqual(names((await admin.get('/records?q=cara%20cli')).text), ['Cara Client']);
  assert.deepEqual(names((await admin.get('/records?q=UBB')).text), ['Omar Other']);
  assert.deepEqual(names((await admin.get('/records?status=Ready%20for%20pickup')).text), ['Omar Other']);
  assert.deepEqual(names((await admin.get('/records?payment=Paid')).text), ['Omar Other']);
  assert.deepEqual(names((await admin.get('/records?payment=Unpaid')).text), ['Cara Client']);
  const collected = (await admin.get('/records?status=Collected')).text;
  assert.match(collected, /5,000/, 'the old job without a status shows up as Collected');
  assert.doesNotMatch(collected, /Omar Other/);
});

test('records list: 25 jobs are split over 2 pages', async () => {
  for (let i = 0; i < 25; i++) await makeRecord({ totalCost: 1000 + i });
  const first = (await admin.get('/records')).text;
  assert.match(first, /Showing 1–20 of 25 jobs/);
  assert.match(first, /Next →/);
  const second = (await admin.get('/records?page=2')).text;
  assert.match(second, /Showing 21–25 of 25 jobs/);
  assert.match(second, /← Previous/);
});

test('technicians do not see payment columns or the payment form', async () => {
  const record = await makeRecord();
  const list = (await tech.get('/records')).text;
  assert.doesNotMatch(list, /Any payment/);
  const detail = (await senior.get(`/records/${record._id}`)).text;
  assert.doesNotMatch(detail, /Save payment/);
  assert.match((await admin.get(`/records/${record._id}`)).text, /Save payment/);
});

test('payments: partial, then full; status follows', async () => {
  const record = await makeRecord({ totalCost: 100000 });
  let res = await admin.postForm(`/records/${record._id}/payments`, { amount: '40000', method: 'Cash', note: 'deposit' }, '/login');
  assert.equal(res.status, 302);
  let fresh = await ServiceRecord.findById(record._id);
  assert.equal(paymentStatus(fresh), 'Part paid');
  assert.equal(fresh.payments[0].note, 'deposit');
  assert.equal(String(fresh.payments[0].receivedBy), String(users.admin._id));

  await admin.postForm(`/records/${record._id}/payments`, { amount: '60000', method: 'Mobile money' }, '/login');
  fresh = await ServiceRecord.findById(record._id);
  assert.equal(paymentStatus(fresh), 'Paid');
  assert.match((await admin.get(`/records/${record._id}`)).text, /Fully paid/);
});

test('payments: more than the balance, zero, decimals and bad methods are all refused', async () => {
  const record = await makeRecord({ totalCost: 100000, payments: [{ amount: 90000, method: 'Cash' }] });
  const attempt = (form) => admin.postForm(`/records/${record._id}/payments`, form, '/login');

  await attempt({ amount: '20000', method: 'Cash' });
  assert.match((await admin.get(`/records/${record._id}`)).text, /more than the balance/);
  await attempt({ amount: '0', method: 'Cash' });
  await attempt({ amount: '10.5', method: 'Cash' });
  await attempt({ amount: '5000', method: 'Bitcoin' });
  assert.equal((await ServiceRecord.findById(record._id)).payments.length, 1);
});

test('payments: two cashiers paying the full balance at the same moment - only one goes through', async () => {
  const record = await makeRecord({ totalCost: 100000 });
  const results = await Promise.all(
    Array.from({ length: 6 }, async () => {
      const b = new Browser(ctx.baseUrl);
      await b.login('admin@test.local');
      return b.postForm(`/records/${record._id}/payments`, { amount: '100000', method: 'Cash' }, '/login');
    }),
  );
  assert.ok(results.every((r) => r.status === 302));
  const fresh = await ServiceRecord.findById(record._id);
  assert.equal(fresh.payments.length, 1, 'the bill must never be paid twice');
  assert.equal(amountPaid(fresh), 100000);
});

test('payments: only an Admin can record one', async () => {
  const record = await makeRecord();
  for (const who of [senior, tech]) {
    await who.postForm(`/records/${record._id}/payments`, { amount: '1000', method: 'Cash' }, '/login');
  }
  assert.equal((await ServiceRecord.findById(record._id)).payments.length, 0);
});

test('editing a job cannot push its total below what was already paid', async () => {
  await admin.postForm('/addRecord', job(), '/addRecord'); // 20000 + 30000 + 36000 = 86000
  const record = await ServiceRecord.findOne();
  await admin.postForm(`/records/${record._id}/payments`, { amount: '80000', method: 'Cash' }, '/login');
  const res = await admin.postForm(`/records/edit/${record._id}`, job({ servicesDone: ['Greasing'], partIds: [], partQuantities: [] }), '/addRecord');
  assert.equal(res.status, 409);
  assert.match(res.text, /already has UGX 80,000 paid/);
  assert.equal((await ServiceRecord.findById(record._id)).totalCost, 86000);
});

test('status: any signed-in user can move a job; bad values and outside redirects are refused', async () => {
  const record = await makeRecord();
  let res = await tech.postForm(`/records/${record._id}/status`, { status: 'Ready for pickup', returnTo: '/my-jobs' }, '/login');
  assert.equal(res.status, 302);
  assert.equal(res.location, '/my-jobs');
  assert.equal((await ServiceRecord.findById(record._id)).status, 'Ready for pickup');

  await tech.postForm(`/records/${record._id}/status`, { status: 'Flying' }, '/login');
  assert.equal((await ServiceRecord.findById(record._id)).status, 'Ready for pickup');

  res = await tech.postForm(`/records/${record._id}/status`, { status: 'Collected', returnTo: '//evil.example.com' }, '/login');
  assert.equal(res.location, `/records/${record._id}`, 'must not redirect to another website');
});

test('my jobs: shows only your own unfinished jobs', async () => {
  const mine = await makeRecord({ servicesDone: ['Brake Pads Change'] });
  await makeRecord({ technicians: [users.senior._id], servicesDone: ['Greasing'] });
  await makeRecord({ servicesDone: ['Wheel Balance'], status: 'Collected' });
  const html = (await tech.get('/my-jobs')).text;
  assert.match(html, /Brake Pads Change/);
  assert.doesNotMatch(html, /Greasing/);
  assert.doesNotMatch(html, /Wheel Balance/);
  assert.match(html, /Mark ready for pickup/);
  assert.ok(mine);
});

test('invoice: shows an invoice number, the itemised bill and the balance', async () => {
  await admin.postForm('/addRecord', job(), '/addRecord');
  const record = await ServiceRecord.findOne();
  await admin.postForm(`/records/${record._id}/payments`, { amount: '30000', method: 'Cash' }, '/login');
  const res = await admin.get(`/records/${record._id}/invoice`);
  assert.equal(res.status, 200);
  assert.match(res.text, new RegExp(`INV-${String(record._id).slice(-6).toUpperCase()}`));
  assert.match(res.text, /Oil Filter Premium/);
  assert.match(res.text, /86,000/);
  assert.match(res.text, /56,000/); // balance
  assert.equal((await admin.get('/records/not-an-id/invoice')).status, 404);
});

test('audit log: records who did what, and only an Admin can read it', async () => {
  await admin.postForm('/addRecord', job(), '/addRecord');
  const record = await ServiceRecord.findOne();
  await admin.postForm(`/records/${record._id}/payments`, { amount: '1000', method: 'Cash' }, '/login');
  await tech.postForm(`/records/${record._id}/status`, { status: 'Ready for pickup' }, '/login');
  await admin.postForm(`/records/delete/${record._id}`, {}, '/login');

  const entries = await AuditLog.find().sort({ at: 1 }).lean();
  assert.deepEqual(entries.map((e) => e.action), ['created', 'payment', 'status', 'deleted']);
  assert.equal(entries[2].actorName, 'Test Tech');
  assert.equal(entries[2].actorRole, 'Technician');

  const page = await admin.get('/audit');
  assert.equal(page.status, 200);
  assert.match(page.text, /Test Tech/);
  assert.match(page.text, /Recorded a Cash payment of UGX 1,000/);
  assert.equal((await admin.get('/audit?entity=Stock')).text.includes('Test Tech'), false);
  assert.equal((await senior.get('/audit')).status, 302);
  assert.equal((await tech.get('/audit')).status, 302);
});

test('CSV export: Admin and Senior can download; contents are safe; Technician cannot', async () => {
  await Customers.create({ firstName: '=HYPERLINK("x")', lastName: 'Evil', phone: '0700000009' });
  await makeRecord();
  const res = await senior.get('/reports/export/customers.csv');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="customers-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.match(res.text, /First name,Last name,Phone,Email,Address/);
  assert.match(res.text, /'=HYPERLINK\(""x""\)/, 'formulas must be neutralised');

  const services = await admin.get('/reports/export/services.csv');
  assert.match(services.text, /Date,Customer,Phone,Plate,Vehicle,Services,Parts,Technicians,Job status,Total \(UGX\),Paid \(UGX\),Balance \(UGX\),Payment status/);
  assert.match(services.text, /Cara Client/);
  assert.match((await admin.get('/reports/export/stock.csv')).text, /Oil Filter Premium/);
  assert.equal((await tech.get('/reports/export/services.csv')).status, 302);
});

test('notifications: the bell and sidebar show low stock and jobs ready for pickup', async () => {
  await Stock.create({ stockId: 'L-1', itemName: 'Nearly Empty Grease', category: 'Grease', quantity: 2, unitPrice: 5000 });
  await makeRecord({ status: 'Ready for pickup' });
  clearNotificationCache();
  const html = (await admin.get('/dashboard')).text;
  assert.match(html, /1 item running low/);
  assert.match(html, /Nearly Empty Grease/);
  assert.match(html, /1 vehicle ready for pickup/);
  assert.match(html, /1 job with a balance to collect/);
  // money notice is Admin only
  clearNotificationCache();
  assert.doesNotMatch((await tech.get('/dashboard')).text, /balance to collect/);
});

test('stock level changes show up in the bell after the cache is cleared', async () => {
  clearNotificationCache();
  assert.match((await admin.get('/dashboard')).text, /Nothing needs attention/);
});

test('audit log also covers stock, customers and vehicles; low stock shows in the bell straight away', async () => {
  await admin.postForm('/registerStock/addStock', { itemName: 'Wiper Blades', category: 'Other', quantity: '3', price: '12000' }, '/registerStock/addStock');
  const stock = await Stock.findOne({ itemName: 'Wiper Blades' });
  assert.match((await admin.get('/dashboard')).text, /Wiper Blades/, 'bell updates right after the stock change');

  await admin.postForm(`/registerStock/stock/edit/${stock._id}`, { itemName: 'Wiper Blades', category: 'Other', quantity: '40', price: '12000' }, '/registerStock/addStock');
  await admin.postForm(`/registerStock/stock/delete/${stock._id}`, {}, '/login');
  await admin.postForm('/customers/register', { customerId: '', firstName: 'Zed', lastName: 'Zulu', phone: '0700000077', email: '', address: '' }, '/customers/register');
  const zed = await Customers.findOne({ firstName: 'Zed' });
  await admin.postForm(`/customers/delete/${zed._id}`, {}, '/login');

  const summaries = (await AuditLog.find().sort({ at: 1 }).lean()).map((e) => `${e.entity}:${e.action}`);
  assert.deepEqual(summaries, ['Stock:created', 'Stock:updated', 'Stock:deleted', 'Customers:created', 'Customers:deleted']);
});

test('service due: worked out from the last service date and shown in the bell and vehicle list', async () => {
  const eightMonthsAgo = new Date();
  eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);
  const overdue = await Vehicle.create({ customerId: customer._id, vehicleName: 'Old Faithful', registrationNo: 'UAA 001A', ownerName: 'Cara Client', vehicleType: 'small', lastService: eightMonthsAgo });
  const fresh = await Vehicle.create({ customerId: customer._id, vehicleName: 'Fresh Wheels', registrationNo: 'UAA 002B', ownerName: 'Cara Client', vehicleType: 'small', lastService: new Date() });
  clearNotificationCache();
  assert.match((await admin.get('/dashboard')).text, /1 vehicle due for service/);
  const page = (await admin.get('/vehicles')).text;
  const row = (plate) => page.slice(page.indexOf(plate), page.indexOf('</tr>', page.indexOf(plate)));
  assert.match(row(overdue.registrationNo), /Service Due/);
  assert.doesNotMatch(row(fresh.registrationNo), /Service Due/);
  assert.match(row(fresh.registrationNo), /Active/);
});

test('vehicles page: most-serviced vehicles are found by vehicle, not by a plate field that no longer exists', async () => {
  await makeRecord();
  await makeRecord();
  const html = (await admin.get('/vehicles')).text;
  assert.match(html, /Corolla \(UAX 456B\)/);
});

test('stock list: items at or below the threshold are labelled Low Stock', async () => {
  await Stock.create({ stockId: 'L-9', itemName: 'Almost Out Fluid', category: 'Other', quantity: 3, unitPrice: 4000 });
  await Stock.create({ stockId: 'L-8', itemName: 'Plenty Fluid', category: 'Other', quantity: 30, unitPrice: 4000 });
  await Stock.create({ stockId: 'L-7', itemName: 'Own Level Fluid', category: 'Other', quantity: 12, reorderLevel: 20, unitPrice: 4000 });
  const page = (await admin.get('/registerStock/stockList')).text;
  const row = (name) => page.slice(page.indexOf(name), page.indexOf('</tr>', page.indexOf(name)));
  assert.match(row('Almost Out Fluid'), /Low Stock/);
  assert.match(row('Own Level Fluid'), /Low Stock/);
  assert.match(row('Plenty Fluid'), /In Stock/);
});
