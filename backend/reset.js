const db = require('./db');
const { init } = require('./init');
const { seed } = require('./seed');

// Drops every demo table and rebuilds it, then loads a fresh set of sample data.
// This is the "reset + reseed" path for a demo machine: the schema is recreated by
// the same migration code the server runs at boot, so the two can never drift.
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
  return seed();
}

module.exports = { reset };

if (require.main === module) {
  (async () => {
    const seeded = await reset();
    const counts = {};
    for (const t of ['products', 'customers', 'stock_items', 'orders', 'quotations', 'invoices', 'lots', 'technical_visits', 'income_expenses']) {
      counts[t] = (await db.get(`SELECT COUNT(*) AS c FROM ${t}`)).c;
    }
    console.log('Reset complete. Seeded tables:', seeded.join(', '));
    console.log('Row counts:', JSON.stringify(counts));
    await db.pool.end();
    process.exit(0);
  })().catch((e) => {
    console.error('RESET ERROR:', e.message);
    process.exit(1);
  });
}
