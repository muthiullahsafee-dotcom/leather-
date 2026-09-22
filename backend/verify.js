const db = require('./db');

const expected = {
  products: ['id', 'code', 'name', 'price', 'sizes_available', 'sole_type'],
  customers: ['id', 'name', 'phone', 'location', 'customer_type'],
  orders: ['id', 'customer_id', 'order_type', 'order_date', 'status', 'payment_status', 'total_amount', 'is_export', 'export_country', 'shipment_date', 'shipping_method', 'tracking_ref'],
  order_items: ['id', 'order_id', 'product_id', 'size', 'quantity', 'unit_price', 'unit_cost'],
  batches: ['id', 'batch_code', 'product_id', 'quantity', 'start_date', 'expected_completion_date', 'stage', 'linked_order_id'],
  stock_items: ['id', 'item_name', 'item_type', 'product_id', 'size', 'quantity', 'unit', 'reorder_threshold'],
  quality_checks: ['id', 'batch_id', 'grade', 'inspector_name', 'inspection_date', 'pass_fail', 'notes'],
  income_expenses: ['id', 'entry_date', 'type', 'category', 'amount', 'note']
};

async function main() {
  let ok = true;
  const tables = await db.all(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  const tableSet = tables.map((t) => t.table_name);

  for (const t of tableSet) {
    const cols = await db.all(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [t]
    );
    const colNames = cols.map((c) => c.column_name);
    const exp = expected[t];
    if (!exp) {
      console.log(`UNEXPECTED TABLE: ${t}`);
      ok = false;
      continue;
    }
    const missing = exp.filter((c) => !colNames.includes(c));
    const extra = colNames.filter((c) => !exp.includes(c));
    const match = missing.length === 0 && extra.length === 0;
    if (!match) ok = false;
    console.log(`${t}: ${match ? 'OK' : 'MISMATCH'} (${colNames.join(', ')})${missing.length ? ' MISSING: ' + missing.join(',') : ''}${extra.length ? ' EXTRA: ' + extra.join(',') : ''}`);
  }

  for (const t in expected) {
    if (!tableSet.includes(t)) {
      console.log(`MISSING TABLE: ${t}`);
      ok = false;
    }
  }

  console.log(ok ? 'SCHEMA VERIFIED: all 8 tables match Section 6 exactly.' : 'SCHEMA PROBLEMS FOUND.');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('VERIFY ERROR:', e.message);
  process.exit(2);
});