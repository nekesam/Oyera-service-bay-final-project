// Fills a SEPARATE database with realistic demo data (customers, vehicles, stock and ~45 jobs
// spread over six months with payments and statuses). Handy for trying the app and for screenshots.
//
//   node scripts/seed-demo.mjs --db=mongodb://localhost:27017/oyera_demo
//
// Logins created:  admin@demo.local / senior@demo.local / tech1@demo.local / tech2@demo.local
// Password for all: Demo@1234
//
// Safety: it wipes the target database first, so it REFUSES to run on the database in your .env.
import 'dotenv/config';
import mongoose from 'mongoose';

const arg = process.argv.find((a) => a.startsWith('--db='));
if (!arg) {
  console.error('Pass a database to fill, e.g. --db=mongodb://localhost:27017/oyera_demo');
  process.exit(1);
}
const url = arg.slice('--db='.length);
if (url === process.env.DATABASE) {
  console.error('Refusing to wipe the database from your .env. Use a different one, e.g. .../oyera_demo');
  process.exit(1);
}

await mongoose.connect(url);
await mongoose.connection.dropDatabase();

const { default: User } = await import('../models/User.mjs');
const { default: Customers } = await import('../models/Customers.mjs');
const { default: Vehicle } = await import('../models/Vehicle.mjs');
const { default: Stock } = await import('../models/Stock.mjs');
const { default: ServiceRecord } = await import('../models/ServiceRecord.mjs');
const { createServiceRecord } = await import('../services/serviceRecordService.mjs');
const { default: AuditLog } = await import('../models/AuditLog.mjs');

const password = 'Demo@1234';
const [admin, senior, tech1, tech2] = await Promise.all(
  [
    ['Grace Namukasa', 'admin@demo.local', 'Admin'],
    ['Peter Okello', 'senior@demo.local', 'Senior technician'],
    ['Sam Mugisha', 'tech1@demo.local', 'Technician'],
    ['Tess Akello', 'tech2@demo.local', 'Technician'],
  ].map(([fullName, email, role]) => User.create({ fullName, email, role, password })),
);

const people = [
  ['Amina', 'Nakato', '0758979048'], ['Brian', 'Muhumuza', '0700000006'], ['Ruth', 'Akello', '0754567423'],
  ['Mark', 'Mubiru', '0777777778'], ['Joan', 'Atim', '0701234567'], ['David', 'Kato', '0772345678'],
  ['Sarah', 'Nabirye', '0783456789'], ['Isaac', 'Ssemakula', '0756789012'],
];
const customers = await Customers.insertMany(people.map(([firstName, lastName, phone]) => ({ firstName, lastName, phone })));

const cars = [
  ['Toyota Corolla', 'UAX 456B', 'small'], ['Toyota Hilux', 'UBB 111C', 'commercial'], ['Honda Fit', 'UAZ 232D', 'small'],
  ['Isuzu Truck', 'UBD 903E', 'heavy'], ['Toyota Premio', 'UAY 118F', 'small'], ['Nissan Note', 'UBA 770G', 'small'],
  ['Mitsubishi Canter', 'UBC 541H', 'commercial'], ['Toyota Harrier', 'UAW 392J', 'small'], ['Subaru Forester', 'UBE 215K', 'small'],
  ['Scania Tipper', 'UBF 884L', 'heavy'],
];
const vehicles = await Vehicle.insertMany(
  cars.map(([vehicleName, registrationNo, vehicleType], i) => {
    const owner = customers[i % customers.length];
    return { vehicleName, registrationNo, vehicleType, customerId: owner._id, ownerName: `${owner.firstName} ${owner.lastName}`, color: ['White', 'Silver', 'Black', 'Blue'][i % 4] };
  }),
);

const stockRows = [
  ['Engine Oil 5W30', 'Engine Oil', 22, 90000], ['Engine Oil 10W40', 'Engine Oil', 14, 110000], ['Oil Filter Premium', 'Oil Filter', 3, 18000],
  ['Brake Fluid DOT4', 'Brake Fluid', 18, 16000], ['Brake Pads (front)', 'Brake Pads', 9, 65000], ['Air Filter Standard', 'Air Filter', 12, 25000],
  ['Gearbox Oil 75W90', 'Gearbox Oil', 6, 70000], ['Coolant 5L', 'Coolant', 2, 35000], ['Chassis Grease 1kg', 'Grease', 0, 22000],
  ['Wiper Blades', 'Other', 25, 12000], ['Spark Plug Set', 'Other', 4, 48000], ['Fuel Filter', 'Filters', 15, 30000],
];
const stock = await Stock.insertMany(stockRows.map(([itemName, category, quantity, unitPrice], i) => ({
  stockId: `STK-${100 + i}`, itemName, category, quantity: quantity + 40, unitPrice, unit: 'Pieces', supplier: 'Kampala Auto Spares', registeredBy: admin._id,
})));
const byName = Object.fromEntries(stock.map((s) => [s.itemName, s]));

// Create jobs through the real service (so prices, stock and bills are exactly what the app produces),
// then back-date them and give them a status and payments.
const serviceSets = [['Greasing'], ['Wheel Alignment'], ['Wheel Balance', 'Greasing'], ['Brake Pads Change'], ['Engine Oil and Filters'], ['Other Minor Repairs'], ['Wheel Alignment', 'Wheel Balance']];
const partSets = [
  [], [['Engine Oil 5W30', 1], ['Oil Filter Premium', 1]], [['Brake Pads (front)', 1], ['Brake Fluid DOT4', 1]],
  [['Air Filter Standard', 1]], [['Engine Oil 10W40', 1], ['Oil Filter Premium', 1], ['Fuel Filter', 1]], [['Wiper Blades', 2]], [['Gearbox Oil 75W90', 1]],
];
const techs = [tech1, tech2, senior];
const methods = ['Cash', 'Mobile money', 'Card'];
let seed = 7;
const rand = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };

for (let i = 0; i < 45; i++) {
  const vehicle = vehicles[rand(vehicles.length)];
  const parts = partSets[rand(partSets.length)];
  const record = await createServiceRecord({
    customer: vehicle.customerId,
    vehicle: vehicle._id,
    servicesDone: serviceSets[rand(serviceSets.length)],
    technicians: [techs[rand(techs.length)]._id, ...(rand(3) === 0 ? [techs[rand(techs.length)]._id] : [])].filter((v, idx, a) => a.findIndex((x) => String(x) === String(v)) === idx),
    partIds: parts.map(([name]) => String(byName[name]._id)),
    partQuantities: parts.map(([, qty]) => qty),
  });

  const ageDays = Math.floor((i / 45) * 170) + rand(3); // oldest first, newest within days
  const date = new Date(Date.now() - (170 - ageDays) * 86400000 - rand(20) * 3600000);
  const recent = i >= 38;
  const status = recent ? ['Booked', 'In progress', 'In progress', 'Ready for pickup', 'Ready for pickup', 'In progress', 'Collected'][i - 38] : 'Collected';
  const roll = rand(10);
  const payments = [];
  if (!recent && roll < 8) payments.push({ amount: record.totalCost, method: methods[rand(3)], receivedBy: admin._id, date });
  else if (roll < 9) payments.push({ amount: Math.floor(record.totalCost / 2 / 1000) * 1000 || 1000, method: 'Mobile money', receivedBy: admin._id, date });
  await ServiceRecord.collection.updateOne({ _id: record._id }, { $set: { date, status, payments } });
}

// leave a few items genuinely low so the low-stock alerts have something to show
for (const [itemName, , quantity] of stockRows) {
  if (quantity <= 5) await Stock.updateOne({ itemName }, { quantity });
}

// a believable audit trail for the demo (the jobs above were created straight through the service layer)
const recent = await ServiceRecord.find().sort({ date: -1 }).limit(8).lean();
const who = (u) => ({ actor: u._id, actorName: u.fullName, actorRole: u.role });
const trail = [
  [admin, 'created', 'ServiceRecord', recent[0], 'Created a service job totalling UGX ' + recent[0].totalCost.toLocaleString('en-US') + '.'],
  [admin, 'payment', 'ServiceRecord', recent[1], 'Recorded a Mobile money payment of UGX 47,000.'],
  [tech1, 'status', 'ServiceRecord', recent[2], 'Changed the job status to "Ready for pickup".'],
  [senior, 'updated', 'Stock', null, 'Edited stock item "Oil Filter Premium": now 3 in stock at UGX 18,000.'],
  [admin, 'created', 'Customers', null, 'Registered customer Isaac Ssemakula.'],
  [tech2, 'status', 'ServiceRecord', recent[3], 'Changed the job status to "In progress".'],
  [admin, 'deleted', 'Vehicle', null, 'Deleted vehicle UAA 000Z.'],
];
for (const [i, [user, action, entity, rec, summary]] of trail.entries()) {
  await AuditLog.collection.insertOne({ ...who(user), action, entity, entityId: rec ? String(rec._id) : undefined, summary, at: new Date(Date.now() - (trail.length - i) * 3600000 * 5) });
}

// last-service dates from the jobs
for (const v of vehicles) {
  const newest = await ServiceRecord.findOne({ vehicle: v._id }).sort({ date: -1 }).lean();
  if (newest) await Vehicle.updateOne({ _id: v._id }, { lastService: newest.date });
}

console.log(`Demo data ready in ${url}`);
console.log(`  ${await ServiceRecord.countDocuments()} jobs, ${customers.length} customers, ${vehicles.length} vehicles, ${stock.length} stock items`);
console.log('  Logins: admin@demo.local, senior@demo.local, tech1@demo.local, tech2@demo.local  (password Demo@1234)');
await mongoose.disconnect();
