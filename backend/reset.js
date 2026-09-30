const db = require('./db');
const { init } = require('./init');
const { seed, counts } = require('./seed');

// Drops every demo table and rebuilds it from scratch, then loads a fresh set of
// sample data. This is the "wipe the slate completely" path, for when the schema
// itself has drifted (not just the data).
//
// For the common case — replacing the demo data while keeping the schema — use
// `npm run reseed`, which empties the rows and re-inserts without dropping anything.
// Both end up at the same dataset; reset just gets there by a heavier route.
//
// The drop order respects the foreign keys, and the whole thing is a single
// transaction so a failure leaves the previous demo data untouched.
const TABLES = [
  'invoice_payments',
  'invoice_items',
  'invoices',
  'quotation_items',
  'quotations',
  'technical_visits',
  'quality_checks',
  'lots',
  'stock_items',
  'order_items',
  'orders',
  'customers',
  'products',
  'income_expenses',
  'seller_profile'
];

async function reset() {
  await db.tx(async (x) => {
    for (const t of TABLES) {
      await x.run(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
  });
  await init();
  // seed() empties every table again before inserting, which is a no-op here but
  // keeps both entry points on exactly one code path for the data.
  return seed();
}

module.exports = { reset };

if (require.main === module) {
  (async () => {
    await reset();
    console.log('Reset complete (tables dropped and recreated).');
    console.log('Row counts:', JSON.stringify(await counts(), null, 2));
    await db.pool.end();
    process.exit(0);
  })().catch((e) => {
    console.error('RESET ERROR:', e.message);
    process.exit(1);
  });
}
