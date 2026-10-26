import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, seedUsers, Browser } from './helpers.mjs';
import Customers from '../models/Customers.mjs';
import Vehicle from '../models/Vehicle.mjs';
import Stock from '../models/Stock.mjs';
import ServiceRecord from '../models/ServiceRecord.mjs';
import { buildLineItems, checkedUnitPrice, mergeRequestedParts } from '../services/pricing.mjs';
import { diffParts } from '../services/stockService.mjs';
import * as serviceRecords from '../services/serviceRecordService.mjs';

// ---------- pure logic: no database needed ----------

test('pricing: labour + charged services + parts are itemised and totalled', () => {
  const filter = { _id: 'f1', itemName: 'Oil Filter Premium', category: 'Oil Filter', unitPrice: 18000 };
  const { lineItems, totalCost } = buildLineItems({
    servicesDone: ['Wheel Alignment', 'Greasing'], // Greasing has no extra charge
    parts: [{ stockItem: filter, quantity: 2 }],
  });
  assert.deepEqual(lineItems.map((l) => [l.type, l.amount]), [['labour', 20000], ['service', 30000], ['part', 36000]]);
  assert.equal(totalCost, 86000);
});

test('pricing: a price outside its allowed band is rejected, never silently changed', () => {
  const typo = { itemName: 'Engine Oil 5W30', category: 'Engine Oil', unitPrice: 8000 };
  assert.throws(() => checkedUnitPrice(typo), /outside the allowed range/);
  assert.equal(checkedUnitPrice({ ...typo, unitPrice: 90000 }), 90000);
  assert.equal(checkedUnitPrice({ itemName: 'Wiper', category: 'Other', unitPrice: 5000 }), 5000); // no rule, any price
});

test('pricing: choosing the same part twice adds the quantities together', () => {
  const merged = mergeRequestedParts(['a', 'b', 'a', ''], [1, 2, 3, 9]);
  assert.deepEqual([...merged], [['a', 4], ['b', 2]]);
});

test('stock diff: only the difference moves in or out of stock', () => {
  const { increase, decrease } = diffParts(
    [{ stockId: 'a', quantity: 2 }, { stockId: 'b', quantity: 4 }, { stockId: 'c', quantity: 1 }],
    [{ stockId: 'a', quantity: 5 }, { stockId: 'b', quantity: 1 }, { stockId: 'd', quantity: 2 }],
  );
  assert.deepEqual(increase, [{ stockId: 'a', quantity: 3 }, { stockId: 'd', quantity: 2 }]);
  assert.deepEqual(decrease, [{ stockId: 'b', quantity: 3 }, { stockId: 'c', quantity: 1 }]);
});

// ---------- with a real database and the real web app ----------

let ctx, users, admin;
let customer, vehicle, filter, oil;

const qty = async (stock) => (await Stock.findById(stock._id)).quantity;

before(async () => {
  ctx = await startServer();
  users = await seedUsers();
  admin = new Browser(ctx.baseUrl);
  await admin.login('admin@test.local');
});
after(() => stopServer(ctx));

beforeEach(async () => {
  await Promise.all([Customers.deleteMany({}), Vehicle.deleteMany({}), Stock.deleteMany({}), ServiceRecord.deleteMany({})]);
  customer = await Customers.create({ firstName: 'Cara', lastName: 'Client', phone: 700000001 });
  vehicle = await Vehicle.create({ customerId: customer._id, vehicleName: 'Corolla', registrationNo: 'UAX 456B', ownerName: 'Cara Client', vehicleType: 'small' });
  filter = await Stock.create({ stockId: 'F-1', itemName: 'Oil Filter Premium', category: 'Oil Filter', quantity: 5, unitPrice: 18000 });
  oil = await Stock.create({ stockId: 'O-1', itemName: 'Engine Oil 5W30', category: 'Engine Oil', quantity: 10, unitPrice: 90000 });
});

const jobForm = (overrides = {}) => ({
  customer: String(customer._id),
  vehicle: String(vehicle._id),
  servicesDone: ['Wheel Alignment'],
  technicians: [String(users.tech._id)],
  partIds: [String(filter._id)],
  partQuantities: ['2'],
  ...overrides,
});

test('creating a job prices it, itemises it and takes the parts out of stock', async () => {
  const res = await admin.postForm('/addRecord', jobForm(), '/addRecord');
  assert.equal(res.status, 302);
  assert.equal(res.location, '/records');

  const record = await ServiceRecord.findOne();
  assert.equal(record.totalCost, 20000 + 30000 + 2 * 18000);
  assert.equal(record.lineItems.length, 3);
  assert.equal(record.partsUsed[0].unitPrice, 18000);
  assert.equal(await qty(filter), 3);
});

test('not enough stock: the job is refused, nothing is saved and stock is untouched', async () => {
  const res = await admin.postForm('/addRecord', jobForm({ partQuantities: ['99'] }), '/addRecord');
  assert.equal(res.status, 409);
  assert.match(res.text, /Insufficient stock for Oil Filter Premium\. Available 5, requested 99/);
  assert.equal(await ServiceRecord.countDocuments(), 0);
  assert.equal(await qty(filter), 5);
});

test('all-or-nothing: if the second part is short, the first part is put back', async () => {
  const res = await admin.postForm(
    '/addRecord',
    jobForm({ partIds: [String(filter._id), String(oil._id)], partQuantities: ['2', '50'] }),
    '/addRecord',
  );
  assert.equal(res.status, 409);
  assert.equal(await qty(filter), 5);
  assert.equal(await qty(oil), 10);
});

test('a wrongly priced part blocks billing with a clear message and takes no stock', async () => {
  await Stock.updateOne({ _id: oil._id }, { unitPrice: 8000 });
  const res = await admin.postForm('/addRecord', jobForm({ partIds: [String(oil._id)], partQuantities: ['1'] }), '/addRecord');
  assert.equal(res.status, 400);
  assert.match(res.text, /outside the allowed range/);
  assert.equal(await qty(oil), 10);
  assert.equal(await ServiceRecord.countDocuments(), 0);
});

test('a vehicle that belongs to someone else is rejected', async () => {
  const other = await Customers.create({ firstName: 'Other', lastName: 'Person', phone: 700000002 });
  const res = await admin.postForm('/addRecord', jobForm({ customer: String(other._id) }), '/addRecord');
  assert.equal(res.status, 400);
  assert.match(res.text, /does not belong to the selected customer/);
});

test('RACE: 10 simultaneous jobs for 5 items - exactly 5 succeed and stock never goes negative', async () => {
  await Stock.updateOne({ _id: filter._id }, { quantity: 5 });
  const attempts = Array.from({ length: 10 }, () =>
    serviceRecords
      .createServiceRecord({
        customer: customer._id,
        vehicle: vehicle._id,
        servicesDone: ['Greasing'],
        technicians: [users.tech._id],
        partIds: [String(filter._id)],
        partQuantities: [1],
      })
      .then(() => 'ok', () => 'refused'),
  );
  const results = await Promise.all(attempts);
  assert.equal(results.filter((r) => r === 'ok').length, 5);
  assert.equal(await qty(filter), 0);
  assert.equal(await ServiceRecord.countDocuments(), 5);
});

test('editing: only the difference in parts moves, and the customer/vehicle can now change', async () => {
  await admin.postForm('/addRecord', jobForm(), '/addRecord'); // uses 2 filters -> 3 left
  const record = await ServiceRecord.findOne();

  // 2 -> 4 filters: take 2 more
  let res = await admin.postForm(`/records/edit/${record._id}`, jobForm({ partQuantities: ['4'] }), '/addRecord');
  assert.equal(res.status, 302);
  assert.equal(await qty(filter), 1);

  // 4 -> 1 filter: give 3 back, and move the job to a different customer + vehicle
  const other = await Customers.create({ firstName: 'Neil', lastName: 'New', phone: 700000003 });
  const otherCar = await Vehicle.create({ customerId: other._id, vehicleName: 'Hilux', registrationNo: 'UBB 111C', ownerName: 'Neil New', vehicleType: 'commercial' });
  res = await admin.postForm(
    `/records/edit/${record._id}`,
    jobForm({ partQuantities: ['1'], customer: String(other._id), vehicle: String(otherCar._id) }),
    '/addRecord',
  );
  assert.equal(res.status, 302);
  assert.equal(await qty(filter), 4);
  const updated = await ServiceRecord.findById(record._id);
  assert.equal(String(updated.customer), String(other._id));
  assert.equal(String(updated.vehicle), String(otherCar._id));
  assert.equal(updated.totalCost, 20000 + 30000 + 18000);
});

test('editing to more than is in stock fails and leaves the record and stock unchanged', async () => {
  await admin.postForm('/addRecord', jobForm(), '/addRecord'); // 3 left
  const record = await ServiceRecord.findOne();
  const res = await admin.postForm(`/records/edit/${record._id}`, jobForm({ partQuantities: ['20'] }), '/addRecord');
  assert.equal(res.status, 409);
  assert.match(res.text, /Insufficient stock/);
  assert.equal(await qty(filter), 3);
  assert.equal((await ServiceRecord.findById(record._id)).partsUsed[0].quantity, 2);
});

test('old bills never change when the price in Inventory changes later', async () => {
  await admin.postForm('/addRecord', jobForm(), '/addRecord');
  await Stock.updateOne({ _id: filter._id }, { unitPrice: 19999 });
  const record = await ServiceRecord.findOne();
  assert.equal(record.totalCost, 86000);
  assert.equal(record.lineItems.find((l) => l.type === 'part').unitPrice, 18000);
});

test('deleting a job puts its parts back in stock', async () => {
  await admin.postForm('/addRecord', jobForm(), '/addRecord');
  assert.equal(await qty(filter), 3);
  const record = await ServiceRecord.findOne();
  const res = await admin.postForm(`/records/delete/${record._id}`, {}, '/addRecord');
  assert.equal(res.status, 302);
  assert.equal(await qty(filter), 5);
  assert.equal(await ServiceRecord.countDocuments(), 0);
});

test('records created before line items existed can still be edited', async () => {
  // simulates an old record: parts remembered by name only, no stock id, no line items
  const old = await ServiceRecord.create({
    customer: customer._id,
    vehicle: vehicle._id,
    servicesDone: ['Greasing'],
    technicians: [users.tech._id],
    partsUsed: [{ itemName: 'Oil Filter Premium', quantity: 2 }],
    totalCost: 56000,
  });
  await Stock.updateOne({ _id: filter._id }, { quantity: 3 }); // 2 were already taken
  const res = await admin.postForm(`/records/edit/${old._id}`, jobForm({ partQuantities: ['2'] }), '/addRecord');
  assert.equal(res.status, 302);
  assert.equal(await qty(filter), 3); // same quantity, so no stock movement
  assert.equal((await ServiceRecord.findById(old._id)).lineItems.length, 3);
});

test('a bad record id gives a friendly 404, not a crash', async () => {
  assert.equal((await admin.get('/records/not-a-real-id')).status, 404);
  assert.equal((await admin.get('/records/64b000000000000000000000')).status, 404);
});
