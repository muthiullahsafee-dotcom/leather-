const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { init } = require('./init');

const app = express();
app.use(express.json());

function mount(apiPath, file) {
  const full = path.join(__dirname, 'routes', file);
  if (fs.existsSync(full)) app.use(apiPath, require(full));
}
mount('/api/products', 'products.js');
mount('/api/stock', 'stock.js');
mount('/api/customers', 'customers.js');
mount('/api/orders', 'orders.js');
mount('/api/batches', 'batches.js');
mount('/api/quality-checks', 'quality.js');
mount('/api/income-expenses', 'ledger.js');
mount('/api/reports', 'reports.js');

let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    console.log('FAIL  ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  }
}

function api(base, method, p, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(p, base);
    const options = { method: method, headers: {} };
    let payload = null;
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const req = http.request(u, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = null;
        }
        resolve({ status: res.statusCode, json: json });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function main() {
  await init();
  const server = app.listen(0);
  const base = 'http://localhost:' + server.address().port;

  let   a = await api(base, 'GET', '/api/products');
  check('GET products -> 200 with at least the 8 seed rows', a.status === 200 && a.json.length >= 8, a);

  a = await api(base, 'POST', '/api/products', { code: 'ZZ-TEST', name: 'Test Style', price: 100 });
  check('POST product -> 201', a.status === 201 && a.json.id, a);
  const newProductId = a.json ? a.json.id : 0;
  a = await api(base, 'DELETE', '/api/products/' + newProductId);
  check('DELETE unreferenced product -> 200', a.status === 200 && a.json.deleted === true, a);
  a = await api(base, 'DELETE', '/api/products/1');
  check('DELETE referenced product blocked -> 400', a.status === 400, a);

  a = await api(base, 'POST', '/api/stock', { item_name: 'ZZ Test Item', item_type: 'Raw Material', quantity: 5, reorder_threshold: 1 });
  check('POST stock raw material -> 201', a.status === 201 && a.json.id, a);
  const newStockId = a.json ? a.json.id : 0;
  a = await api(base, 'DELETE', '/api/stock/' + newStockId);
  check('DELETE stock item -> 200', a.status === 200 && a.json.deleted === true, a);

  a = await api(base, 'GET', '/api/stock');
  check('GET stock -> 200 with low_stock flags', a.status === 200 && a.json.length === 9 && a.json.every((s) => 'low_stock' in s), a);

  a = await api(base, 'GET', '/api/customers');
  check('GET customers -> 200 with 5 rows', a.status === 200 && a.json.length === 5, a);

  a = await api(base, 'GET', '/api/orders');
  check('GET orders -> 200 with 6 rows', a.status === 200 && a.json.length === 6, a);

  a = await api(base, 'GET', '/api/batches');
  check('GET batches -> 200 with 3 rows', a.status === 200 && a.json.length === 3, a);
  check('batch1 LS2-2026-B01 Stitching', a.json[0].batch_code === 'LS2-2026-B01' && a.json[0].stage === 'Stitching', a.json[0]);

  a = await api(base, 'GET', '/api/batches/1');
  check('GET batch 1 linked to order', a.status === 200 && a.json.id === 1 && a.json.linked_order_id !== null, a.json);

  a = await api(base, 'POST', '/api/batches', { batch_code: 'B-TEST-1', product_id: 1, quantity: 100, stage: 'Cutting' });
  check('POST batch -> 201', a.status === 201 && a.json.id, a);
  const newBatchId = a.json.id;

  a = await api(base, 'POST', '/api/batches/' + newBatchId + '/advance');
  check('advance batch 1 step (Cutting -> Stitching)', a.status === 200 && a.json.stage === 'Stitching', a.json);
  a = await api(base, 'POST', '/api/batches/' + newBatchId + '/advance');
  check('advance again (Stitching -> Finishing)', a.status === 200 && a.json.stage === 'Finishing', a.json);
  a = await api(base, 'POST', '/api/batches/' + newBatchId + '/advance');
  check('advance again (Finishing -> Quality Check)', a.status === 200 && a.json.stage === 'Quality Check', a.json);
  a = await api(base, 'POST', '/api/batches/' + newBatchId + '/advance');
  check('advance again (Quality Check -> Packed)', a.status === 200 && a.json.stage === 'Packed', a.json);
  a = await api(base, 'POST', '/api/batches/' + newBatchId + '/advance');
  check('advance beyond Packed blocked -> 400', a.status === 400, a);

  a = await api(base, 'PATCH', '/api/orders/2/status', { status: 'Delivered' });
  check('PATCH order status via orders route', a.status === 200 && a.json.status === 'Delivered', a.json);
  await db.run("UPDATE orders SET status = 'Shipped' WHERE id = 2");

  a = await api(base, 'GET', '/api/quality-checks');
  check('GET quality checks -> 200 with 2 rows', a.status === 200 && a.json.length === 2, a);

  a = await api(base, 'GET', '/api/income-expenses');
  check('GET ledger -> 200 with 8 rows', a.status === 200 && a.json.length === 8, a);
  const chrono = a.json.slice().sort((x, y) => (x.entry_date + '-' + x.id < y.entry_date + '-' + y.id ? -1 : 1));
  let balance = 0;
  let balOK = true;
  for (const r of chrono) {
    balance += r.type === 'Income' ? r.amount : -1 * r.amount;
    if (r.running_balance !== balance) balOK = false;
  }
  check('ledger running balance rolls chronologically', balOK, chrono);
  check('ledger net = -57005', balance === -57005, balance);

  a = await api(base, 'GET', '/api/reports/sales-over-time');
  check('GET reports sales-over-time -> 200 with 2 months', a.status === 200 && a.json.length === 2, a);
  check('Sep 2026 sales value matches seed', a.json.find((x) => x.month === '2026-09').sales === 541998, a.json);

  a = await api(base, 'GET', '/api/reports/profit-by-month');
  check('GET reports profit-by-month -> Sep profit 146258', a.status === 200 && a.json.find((x) => x.month === '2026-09').profit === 146258, a.json);

  a = await api(base, 'GET', '/api/reports/stock-by-style');
  check('GET reports stock-by-style -> LS1 25 pairs', a.status === 200 && a.json.find((x) => x.style === 'LS1').pairs_available === 25, a.json);

  a = await api(base, 'GET', '/api/reports/orders-by-status');
  check('GET reports orders-by-status -> 6 statuses', a.status === 200 && a.json.length === 6, a.json);

  a = await api(base, 'GET', '/api/reports/income-expense-by-month');
  check('income-expense-by-month -> 2 months ascending', a.status === 200 && a.json.length === 2 && a.json[0].month === '2026-08' && a.json[1].month === '2026-09', a.json);
  check('Aug income 125000 / expenses 145000 / profit -20000', a.json[0] && a.json[0].income === 125000 && a.json[0].expenses === 145000 && a.json[0].profit === -20000, a.json[0]);
  check('Sep income 104995 / expenses 142000 / profit -37005', a.json[1] && a.json[1].income === 104995 && a.json[1].expenses === 142000 && a.json[1].profit === -37005, a.json[1]);

  a = await api(base, 'GET', '/api/reports/salary-this-month');
  const curMonth = new Date().toISOString().slice(0, 7);
  const expectedSalary = (await db.get("SELECT COALESCE(SUM(amount),0) AS t FROM income_expenses WHERE type='Expense' AND lower(COALESCE(category,'')) LIKE '%salary%' AND substr(entry_date,1,7)=$1", [curMonth])).t;
  check('salary-this-month matches ledger sum for current month', a.status === 200 && a.json.month === curMonth && a.json.total === expectedSalary, a.json);

  // cleanup test-created batch
  await db.run('DELETE FROM batches WHERE id = $1', [newBatchId]);

  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await db.pool.end();
  await new Promise((r) => setTimeout(r, 100));
  console.log('=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('HARNESS ERROR: ' + e.message);
  try { db.pool.end(); } catch (x) {}
  process.exit(2);
});