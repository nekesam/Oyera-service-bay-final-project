import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, seedUsers, Browser } from './helpers.mjs';
import Customers from '../models/Customers.mjs';
import Vehicle from '../models/Vehicle.mjs';
import Stock from '../models/Stock.mjs';
import ServiceRecord from '../models/ServiceRecord.mjs';
import { normalizePhone } from '../utils/phone.mjs';

test('phone: every common way of typing a number becomes 0XXXXXXXXX', () => {
  for (const typed of ['+256 758 979048', '256758979048', '0758-979-048', '758979048', ' 0758979048 ']) {
    assert.equal(normalizePhone(typed), '0758979048', typed);
  }
  assert.equal(normalizePhone(''), '');
});

let ctx, users, admin;
before(async () => {
  ctx = await startServer();
  users = await seedUsers();
  admin = new Browser(ctx.baseUrl);
  await admin.login('admin@test.local');
});
after(() => stopServer(ctx));

beforeEach(async () => {
  await Promise.all([Customers.deleteMany({}), Vehicle.deleteMany({}), Stock.deleteMany({}), ServiceRecord.deleteMany({})]);
});

const customerForm = (overrides = {}) => ({
  customerId: '',
  firstName: 'Amina',
  lastName: 'Nakato',
  phone: '+256 758 979048',
  email: '',
  address: '',
  ...overrides,
});

test('customers: a +256 number now saves, stored as text with its leading zero', async () => {
  const res = await admin.postForm('/customers/register', customerForm(), '/customers/register');
  assert.equal(res.status, 302);
  const saved = await Customers.findOne({ firstName: 'Amina' }).lean();
  assert.strictEqual(saved.phone, '0758979048');
});

test('customers: the same person typed a different way is caught as a duplicate', async () => {
  await admin.postForm('/customers/register', customerForm(), '/customers/register');
  const again = await admin.postForm('/customers/register', customerForm({ phone: '0758979048' }), '/customers/register');
  assert.equal(again.status, 400);
  assert.match(again.text, /already registered/);
  assert.equal(await Customers.countDocuments(), 1);
});

test('customers: editing normalises the phone too', async () => {
  const c = await Customers.create({ firstName: 'Brian', lastName: 'Okello', phone: '0700000001' });
  const res = await admin.postForm(`/customers/edit/${c._id}`, customerForm({ firstName: 'Brian', lastName: 'Okello', phone: '+256 700 000 009' }), '/customers/register');
  assert.equal(res.status, 302);
  assert.equal((await Customers.findById(c._id).lean()).phone, '0700000009');
});

test('search: finds a customer by phone, including old records that stored a Number', async () => {
  await Customers.create({ firstName: 'Newstyle', lastName: 'Text', phone: '0758979048' });
  await Customers.collection.insertOne({ firstName: 'Legacy', lastName: 'Number', phone: 700123456 }); // old format
  const byText = await admin.get('/search?q=0758979');
  assert.match(byText.text, /Newstyle/);
  assert.doesNotMatch(byText.text, /Legacy/);
  const byLegacy = await admin.get('/search?q=700123');
  assert.match(byLegacy.text, /Legacy/);
});

test('delete protection: a customer with vehicles or service records cannot be deleted', async () => {
  const c = await Customers.create({ firstName: 'Has', lastName: 'Vehicle', phone: '0700000002' });
  const v = await Vehicle.create({ customerId: c._id, vehicleName: 'Corolla', registrationNo: 'UAX 111A', ownerName: 'Has Vehicle', vehicleType: 'small' });

  let res = await admin.postForm(`/customers/delete/${c._id}`, {}, '/customers/register');
  assert.equal(res.status, 302);
  assert.equal(await Customers.countDocuments({ _id: c._id }), 1);
  assert.match((await admin.get('/customers/records')).text, /cannot be deleted because they still have 1 vehicle/);

  await ServiceRecord.create({ customer: c._id, vehicle: v._id, servicesDone: ['Greasing'], technicians: [users.tech._id], totalCost: 20000 });
  await admin.postForm(`/vehicles/delete/${v._id}`, {}, '/customers/register');
  assert.equal(await Vehicle.countDocuments({ _id: v._id }), 1, 'vehicle with a service record must stay');
  assert.match((await admin.get('/vehicles')).text, /cannot be deleted because it has 1 service record/);
});

test('delete protection: things nobody uses can still be deleted', async () => {
  const c = await Customers.create({ firstName: 'Free', lastName: 'ToGo', phone: '0700000003' });
  const v = await Vehicle.create({ vehicleName: 'Spare', registrationNo: 'UAX 222B', ownerName: 'Free ToGo', vehicleType: 'small' });
  const s = await Stock.create({ stockId: 'X-1', itemName: 'Unused Item', category: 'Other', quantity: 1, unitPrice: 1000 });
  await admin.postForm(`/customers/delete/${c._id}`, {}, '/customers/register');
  await admin.postForm(`/vehicles/delete/${v._id}`, {}, '/customers/register');
  await admin.postForm(`/registerStock/stock/delete/${s._id}`, {}, '/customers/register');
  assert.equal(await Customers.countDocuments(), 0);
  assert.equal(await Vehicle.countDocuments(), 0);
  assert.equal(await Stock.countDocuments(), 0);
});

test('delete protection: stock that was used in a service record cannot be deleted', async () => {
  const c = await Customers.create({ firstName: 'Used', lastName: 'Stock', phone: '0700000004' });
  const v = await Vehicle.create({ customerId: c._id, vehicleName: 'Hilux', registrationNo: 'UAX 333C', ownerName: 'Used Stock', vehicleType: 'commercial' });
  const s = await Stock.create({ stockId: 'U-1', itemName: 'Used Grease', category: 'Grease', quantity: 4, unitPrice: 5000 });
  await ServiceRecord.create({
    customer: c._id, vehicle: v._id, servicesDone: ['Greasing'], technicians: [users.tech._id], totalCost: 25000,
    partsUsed: [{ stockId: s._id, itemName: s.itemName, quantity: 1, unitPrice: 5000 }],
  });
  await admin.postForm(`/registerStock/stock/delete/${s._id}`, {}, '/customers/register');
  assert.equal(await Stock.countDocuments({ _id: s._id }), 1);
  assert.match((await admin.get('/registerStock/stockList')).text, /cannot be deleted because it was used in 1 service record/);
});

test('stock prices: out-of-range prices are rejected as typed, not silently multiplied', async () => {
  const stockForm = (overrides) => ({ itemName: 'Engine Oil 10W40', category: 'Engine Oil', quantity: '5', price: '90000', ...overrides });

  let res = await admin.postForm('/registerStock/addStock', stockForm({ price: '8000' }), '/registerStock/addStock');
  assert.equal(res.status, 400);
  assert.match(res.text, /Engine Oil price must be between UGX 79,000 and UGX 200,000/);
  assert.equal(await Stock.countDocuments(), 0, '8000 must NOT be quietly turned into 80000');

  res = await admin.postForm('/registerStock/addStock', stockForm({ itemName: 'Brake Fluid DOT4', category: 'Brake Fluid', price: '35000' }), '/registerStock/addStock');
  assert.equal(res.status, 400);
  assert.match(res.text, /Brake Fluid price must be between UGX 13,000 and UGX 20,000/);

  res = await admin.postForm('/registerStock/addStock', stockForm(), '/registerStock/addStock');
  assert.equal(res.status, 302);
  assert.equal((await Stock.findOne()).unitPrice, 90000);
});
