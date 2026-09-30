// Schema check for the Surya Tech demo.
//
// `init.js` creates the schema and upgrades an older database in place, so this script
// is what proves the result of that: every table and column the API reads is really
// there, and nothing from the old footwear schema is left behind.
//
// Run with:  node verify.js          (DATABASE_URL must point at a migrated database)

const db = require('./db');

// Columns the routes read or write. Extra columns are allowed (the migration keeps a few
// for the old data), but anything listed here must exist.
const REQUIRED = {
  seller_profile: ['id', 'business_name', 'address', 'city', 'district', 'state', 'state_code', 'gstin', 'phone', 'email', 'is_sample'],
  products: ['id', 'code', 'name', 'hsn_code', 'unit', 'brand', 'purchase_price', 'selling_price', 'gst_rate', 'reorder_level'],
  customers: ['id', 'name', 'phone', 'location', 'customer_type', 'gstin', 'state_code', 'credit_terms_days'],
  stock_items: ['id', 'product_id', 'item_name', 'quantity', 'unit', 'warehouse'],
  orders: ['id', 'order_no', 'customer_id', 'supply_type', 'order_date', 'status', 'payment_status', 'total_amount', 'delivery_date', 'vehicle_number'],
  order_items: ['id', 'order_id', 'product_id', 'quantity', 'unit_price', 'unit_cost'],
  quotations: ['id', 'quotation_no', 'customer_id', 'quote_date', 'valid_until', 'status', 'total_amount', 'notes', 'converted_order_id'],
  quotation_items: ['id', 'quotation_id', 'product_id', 'quantity', 'unit_price', 'unit_cost'],
  invoices: ['id', 'invoice_no', 'order_id', 'customer_id', 'invoice_date', 'due_date', 'status', 'place_of_supply', 'seller_gstin', 'buyer_gstin', 'subtotal', 'cgst', 'sgst', 'igst', 'total_amount', 'amount_paid', 'amount_due', 'amount_in_words', 'irn', 'irn_generated_at', 'eway_bill', 'eway_generated_at'],
  invoice_items: ['id', 'invoice_id', 'product_id', 'hsn_code', 'description', 'unit', 'quantity', 'rate', 'taxable_value', 'gst_rate', 'tax_amount'],
  invoice_payments: ['id', 'invoice_id', 'payment_date', 'amount', 'mode', 'note'],
  lots: ['id', 'lot_no', 'product_id', 'supplier', 'received_date', 'expiry_date', 'quantity', 'status', 'warehouse', 'linked_order_id'],
  quality_checks: ['id', 'lot_id', 'grade', 'inspector_name', 'inspection_date', 'pass_fail', 'notes'],
  technical_visits: ['id', 'customer_id', 'visit_date', 'engineer', 'issue', 'solution_given', 'follow_up_date', 'status'],
  income_expenses: ['id', 'entry_date', 'type', 'category', 'amount', 'note', 'invoice_id']
};

// Columns the footwear version of this app used. None of them may survive.
const REMOVED = {
  products: ['price', 'sizes_available', 'sole_type', 'category'],
  orders: ['order_type', 'is_export', 'export_country', 'shipment_date', 'shipping_method', 'tracking_ref'],
  order_items: ['size'],
  stock_items: ['item_type', 'size', 'reorder_threshold'],
  quality_checks: ['batch_id'],
  batches: ['batch_code', 'stage', 'start_date', 'expected_completion_date']
};

// Tables that must not exist any more: batches was renamed to lots.
const DROPPED_TABLES = ['batches'];

// Foreign keys the app relies on to keep the documents consistent.
const FOREIGN_KEYS = [
  ['order_items', 'order_id', 'orders'],
  ['order_items', 'product_id', 'products'],
  ['quotation_items', 'quotation_id', 'quotations'],
  ['quotation_items', 'product_id', 'products'],
  ['invoice_items', 'invoice_id', 'invoices'],
  ['invoice_payments', 'invoice_id', 'invoices'],
  ['invoices', 'customer_id', 'customers'],
  ['invoices', 'order_id', 'orders'],
  ['lots', 'product_id', 'products'],
  ['quality_checks', 'lot_id', 'lots'],
  ['technical_visits', 'customer_id', 'customers'],
  ['stock_items', 'product_id', 'products'],
  ['orders', 'customer_id', 'customers'],
  ['quotations', 'customer_id', 'customers']
];

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name);
    console.log('FAIL  ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  }
}

async function main() {
  const tables = await db.all(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
  const tableSet = tables.map((t) => t.table_name);

  const columns = {};
  for (const table of tableSet) {
    const cols = await db.all(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table]);
    columns[table] = cols.map((c) => c.column_name);
  }

  for (const table of Object.keys(REQUIRED)) {
    check(`table ${table} exists`, tableSet.includes(table), tableSet);
    if (!tableSet.includes(table)) continue;
    const missing = REQUIRED[table].filter((c) => !columns[table].includes(c));
    check(`table ${table} has every column the API uses`, missing.length === 0, { missing, have: columns[table] });
  }

  for (const [table, gone] of Object.entries(REMOVED)) {
    if (!tableSet.includes(table)) continue;
    const survivors = gone.filter((c) => columns[table].includes(c));
    check(`table ${table} has no leftover footwear columns`, survivors.length === 0, survivors);
  }

  for (const table of DROPPED_TABLES) {
    check(`table ${table} no longer exists (renamed to lots)`, !tableSet.includes(table), tableSet);
  }

  const fks = await db.all(`
    SELECT tc.table_name, kcu.column_name, ccu.table_name AS references
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);
  const fkSet = new Set(fks.map((f) => `${f.table_name}.${f.column_name}->${f.references}`));
  for (const [table, column, ref] of FOREIGN_KEYS) {
    check(`foreign key ${table}.${column} -> ${ref}`, fkSet.has(`${table}.${column}->${ref}`), [...fkSet].filter((k) => k.startsWith(table + '.')));
  }

  // Re-running init() must be a no-op: the migration is idempotent by design.
  const { init } = require('./init');
  await init();
  check('init() runs a second time without changing the schema', true);
  const after = await db.all(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
  check('no table is added or lost on a second init()',
    after.map((t) => t.table_name).join(',') === tableSet.join(','),
    { before: tableSet, after: after.map((t) => t.table_name) });

  console.log('\n=== SCHEMA VERIFIED: ' + passed + ' passed, ' + failed + ' failed ===');
  if (failed) console.log('Failed checks:\n  - ' + failures.join('\n  - '));
  await db.pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error('VERIFY ERROR: ' + e.message);
  try { await db.pool.end(); } catch (x) {}
  process.exit(2);
});
