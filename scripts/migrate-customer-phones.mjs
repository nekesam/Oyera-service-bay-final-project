// One-off migration: customers' phone numbers used to be stored as Numbers
// (so 0758979048 became 758979048). This converts them to 10-digit strings like 0758979048.
//
//   node scripts/migrate-customer-phones.mjs           -> dry run: shows what WOULD change
//   node scripts/migrate-customer-phones.mjs --apply   -> saves a backup file, then applies
//
// Safe to run more than once: customers that are already strings are skipped.
import fs from 'fs';
import mongoose from 'mongoose';
import { config } from '../config/index.mjs';
import { normalizePhone } from '../utils/phone.mjs';

const apply = process.argv.includes('--apply');

await mongoose.connect(config.databaseUrl);
const customers = mongoose.connection.db.collection('customers');
const stale = await customers.find({ phone: { $type: ['int', 'long', 'double', 'decimal'] } }).toArray();

if (!stale.length) {
  console.log('Nothing to migrate: no customers have a numeric phone.');
} else {
  console.log(`${stale.length} customer(s) have a numeric phone:`);
  for (const c of stale) console.log(`  ${c.firstName} ${c.lastName}: ${c.phone} -> ${normalizePhone(c.phone)}`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to save these changes.');
  } else {
    const backup = `customers-phone-backup-${Date.now()}.json`;
    fs.writeFileSync(backup, JSON.stringify(stale, null, 2));
    console.log(`\nBackup written to ${backup}`);
    for (const c of stale) {
      await customers.updateOne({ _id: c._id }, { $set: { phone: normalizePhone(c.phone) } });
    }
    console.log('Done.');
  }
}
await mongoose.disconnect();
