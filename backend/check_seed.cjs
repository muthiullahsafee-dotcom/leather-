const db = require('./db');

async function main() {
  let ok = true;
  function problem(msg) {
    ok = false;
    console.log('PROBLEM:', msg);
  }

  const expected = { products: 8, customers: 5, orders: 6, order_items: 8, batches: 3, stock_items: 9, quality_checks: 2, income_expenses: 8 };
  const counts = {};
  for (const t of Object.keys(expected)) {
    counts[t] = (await db.get(`SELECT COUNT(*) AS c FROM ${t}`)).c;
  }

  const orphanItems = await db.all(
    `SELECT oi.id FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id LEFT JOIN products p ON oi.product_id = p.id
     WHERE o.id IS NULL OR p.id IS NULL`
  );
  if (orphanItems.length) problem(`orphan order_items: ${JSON.stringify(orphanItems)}`);

  const orphanOrders = await db.all('SELECT id FROM orders WHERE customer_id NOT IN (SELECT id FROM customers)');
  if (orphanOrders.length) problem(`orphan orders: ${JSON.stringify(orphanOrders)}`);

  const orphanBatches = await db.all(
    `SELECT id, linked_order_id FROM batches WHERE linked_order_id IS NOT NULL AND linked_order_id NOT IN (SELECT id FROM orders)`
  );
  if (orphanBatches.length) problem(`orphan batch links: ${JSON.stringify(orphanBatches)}`);

  const orphanStock = await db.all(
    `SELECT id FROM stock_items WHERE product_id IS NOT NULL AND product_id NOT IN (SELECT id FROM products)`
  );
  if (orphanStock.length) problem(`orphan finished stock: ${JSON.stringify(orphanStock)}`);

  const orphanChecks = await db.all('SELECT id FROM quality_checks WHERE batch_id NOT IN (SELECT id FROM batches)');
  if (orphanChecks.length) problem(`orphan quality checks: ${JSON.stringify(orphanChecks)}`);

  for (const [table, key] of [['products', 'code'], ['customers', 'name'], ['batches', 'batch_code']]) {
    const d = await db.all(`SELECT ${key}, COUNT(*) AS c FROM ${table} GROUP BY ${key} HAVING COUNT(*) > 1`);
    if (d.length) problem(`duplicate ${key} in ${table}: ${JSON.stringify(d)}`);
  }

  const summary = {};

  const orders = await db.all(`SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON o.customer_id = c.id`);
  const statuses = {};
  for (const o of orders) statuses[o.status] = (statuses[o.status] || 0) + 1;

  const salesByMonth = {};
  const profitByMonth = {};
  const items = await db.all('SELECT * FROM order_items');
  for (const it of items) {
    const o = orders.find((x) => x.id === it.order_id);
    if (!o) continue;
    const m = o.order_date.slice(0, 7);
    if (o.status === 'Cancelled') continue;
    salesByMonth[m] = (salesByMonth[m] || 0) + it.unit_price * it.quantity;
    profitByMonth[m] = (profitByMonth[m] || 0) + (it.unit_price - it.unit_cost) * it.quantity;
  }

  summary.ordersByStatus = statuses;
  summary.salesByMonth = salesByMonth;
  summary.profitByMonth = profitByMonth;

  const prodIds = await db.all('SELECT * FROM products');
  const prodCodeById = {};
  for (const p of prodIds) prodCodeById[p.id] = p.code;
  const stockByStyle = {};
  const allStock = await db.all('SELECT * FROM stock_items WHERE item_type = $1', ['Finished Stock']);
  for (const s of allStock) {
    const code = prodCodeById[s.product_id];
    if (code) stockByStyle[code] = (stockByStyle[code] || 0) + s.quantity;
  }
  summary.stockByStyle = stockByStyle;

  const exportOrders = orders.filter((o) => o.is_export === 1);
  summary.exports = exportOrders.map((o) => ({ id: o.id, country: o.export_country, tracking: o.tracking_ref }));

  for (const t of Object.keys(expected)) {
    if (counts[t] !== expected[t]) problem(`${t}: expected ${expected[t]} rows, got ${counts[t]}`);
  }

  console.log('Counts:', JSON.stringify(counts));
  console.log('Orders by status:', JSON.stringify(summary.ordersByStatus));
  console.log('Sales by month (excl cancelled):', JSON.stringify(summary.salesByMonth));
  console.log('Profit by month (excl cancelled):', JSON.stringify(summary.profitByMonth));
  console.log('Finished stock by style:', JSON.stringify(summary.stockByStyle));
  console.log('Export orders:', JSON.stringify(summary.exports));
  console.log(ok ? 'SEED VERIFIED: counts correct, no orphans, no duplicate codes, links intact.' : 'SEED PROBLEMS FOUND.');
  await db.pool.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('CHECK_SEED ERROR:', e.message);
  process.exit(2);
});