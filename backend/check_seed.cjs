const db = require('./db');

let ok = true;
function problem(msg) {
  ok = false;
  console.log('PROBLEM:', msg);
}

// Expected counts from Section 7
const expected = { products: 8, customers: 5, orders: 6, order_items: 8, batches: 3, stock_items: 9, quality_checks: 2, income_expenses: 8 };
const counts = {};
for (const t of Object.keys(expected)) {
  counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
}

// Orphan checks
const orphanItems = db.prepare(
  `SELECT oi.id FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id LEFT JOIN products p ON oi.product_id = p.id
   WHERE o.id IS NULL OR p.id IS NULL`
).all();
if (orphanItems.length) problem(`orphan order_items: ${JSON.stringify(orphanItems)}`);

const orphanOrders = db.prepare('SELECT id FROM orders WHERE customer_id NOT IN (SELECT id FROM customers)').all();
if (orphanOrders.length) problem(`orphan orders: ${JSON.stringify(orphanOrders)}`);

const orphanBatches = db.prepare(
  `SELECT id, linked_order_id FROM batches WHERE linked_order_id IS NOT NULL AND linked_order_id NOT IN (SELECT id FROM orders)`
).all();
if (orphanBatches.length) problem(`orphan batch links: ${JSON.stringify(orphanBatches)}`);

const orphanStock = db.prepare(
  `SELECT id FROM stock_items WHERE product_id IS NOT NULL AND product_id NOT IN (SELECT id FROM products)`
).all();
if (orphanStock.length) problem(`orphan finished stock: ${JSON.stringify(orphanStock)}`);

const orphanChecks = db.prepare('SELECT id FROM quality_checks WHERE batch_id NOT IN (SELECT id FROM batches)').all();
if (orphanChecks.length) problem(`orphan quality checks: ${JSON.stringify(orphanChecks)}`);

// Duplicate checks
for (const [table, key] of [['products', 'code'], ['customers', 'name'], ['batches', 'batch_code']]) {
  const d = db.prepare(`SELECT ${key}, COUNT(*) AS c FROM ${table} GROUP BY ${key} HAVING c > 1`).all();
  if (d.length) problem(`duplicate ${key} in ${table}: ${JSON.stringify(d)}`);
}

// Summary expectations
const summary = {};

const orders = db.prepare(`
  SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON o.customer_id = c.id
`).all();
const statuses = {};
for (const o of orders) statuses[o.status] = (statuses[o.status] || 0) + 1;

const salesByMonth = {};
const profitByMonth = {};
const items = db.prepare('SELECT * FROM order_items').all();
const itemsByOrder = {};
for (const it of items) (itemsByOrder[it.order_id] = itemsByOrder[it.order_id] || []).push(it);

const orderIdByItem = {};
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

const prodIds = db.prepare('SELECT * FROM products').all();
const prodCodeById = {};
for (const p of prodIds) prodCodeById[p.id] = p.code;
const stockByStyle = {};
const allStock = db.prepare('SELECT * FROM stock_items WHERE item_type = ?').all('Finished Stock');
for (const s of allStock) {
  const code = prodCodeById[s.product_id];
  if (code) stockByStyle[code] = (stockByStyle[code] || 0) + s.quantity;
}
summary.stockByStyle = stockByStyle;

const exportOrders = orders.filter((o) => o.is_export === 1);
summary.exports = exportOrders.map((o) => ({ id: o.id, country: o.export_country, tracking: o.tracking_ref }));

// Verify expected counts match
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
process.exit(ok ? 0 : 1);