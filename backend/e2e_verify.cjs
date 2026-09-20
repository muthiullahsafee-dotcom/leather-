const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { init } = require('./init');

init();

const app = express();
app.use(express.json());

app.use('/api/products', require('./routes/products'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/batches', require('./routes/batches'));
app.use('/api/quality-checks', require('./routes/quality'));
app.use('/api/income-expenses', require('./routes/ledger'));
app.use('/api/reports', require('./routes/reports'));

const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(dist)) app.use(express.static(dist));

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
    const options = { method, headers: {} };
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
        try { json = JSON.parse(data); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, raw: data });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function main() {
  const server = app.listen(0);
  const base = 'http://localhost:' + server.address().port;
  const created = { customerId: null, orderId: null, batchId: null, qcId: null, ledgerId: null };

  let a = await api(base, 'GET', '/');
  check('frontend index served (dist)', a.status === 200 && a.raw.indexOf('Leather Stylish') !== -1, a.status);

  a = await api(base, 'GET', '/api/orders');
  check('dashboard orders fetch', a.status === 200 && Array.isArray(a.json), a.status);
  a = await api(base, 'GET', '/api/stock');
  check('dashboard stock fetch has low_stock', a.status === 200 && a.json.every((s) => 'low_stock' in s), a.status);

  a = await api(base, 'POST', '/api/customers', { name: 'E2E Test Traders', customer_type: 'Wholesale', location: 'Ambur', phone: '90000 00000' });
  check('create customer', a.status === 201 && a.json.id, a);
  created.customerId = a.json.id;

  a = await api(base, 'POST', '/api/orders', {
    customer_id: created.customerId,
    order_type: 'Wholesale',
    order_date: '2026-09-18',
    status: 'Pending',
    payment_status: 'Unpaid',
    is_export: 0,
    items: [{ product_id: 1, size: '42', quantity: 10, unit_price: 1250, unit_cost: 900 }]
  });
  check('create order with items (total 12500)', a.status === 201 && a.json.total_amount === 12500 && a.json.items.length === 1, a);
  created.orderId = a.json.id;

  a = await api(base, 'PATCH', '/api/orders/' + created.orderId + '/status', { status: 'In Production' });
  check('advance order to In Production', a.status === 200 && a.json.status === 'In Production', a.json);

  a = await api(base, 'POST', '/api/batches', { batch_code: 'E2E-BATCH-1', product_id: 1, quantity: 10, stage: 'Cutting', linked_order_id: created.orderId });
  check('create batch linked to order', a.status === 201 && a.json.linked_order_id === created.orderId, a);
  created.batchId = a.json.id;

  for (const want of ['Stitching', 'Finishing', 'Quality Check', 'Packed']) {
    a = await api(base, 'POST', '/api/batches/' + created.batchId + '/advance');
    if (a.status !== 200 || a.json.stage !== want) {
      check('advance batch to ' + want, false, a);
    }
  }
  check('advance batch through all stages to Packed', a.status === 200 && a.json.stage === 'Packed', a.json);

  a = await api(base, 'POST', '/api/quality-checks', { batch_id: created.batchId, grade: 'Local Grade A', inspector_name: 'E2E Inspector', inspection_date: '2026-09-18', pass_fail: 'Pass' });
  check('create quality check for batch', a.status === 201 && a.json.batch_id === created.batchId, a);
  created.qcId = a.json.id;

  a = await api(base, 'POST', '/api/income-expenses', { entry_date: '2026-09-18', type: 'Income', category: 'Sales', amount: 12500, note: 'E2E test entry' });
  check('create ledger entry', a.status === 201 && a.json.id, a);
  created.ledgerId = a.json.id;

  a = await api(base, 'GET', '/api/reports/sales-over-time');
  check('sales report responds', a.status === 200 && a.json.length >= 2, a.status);
  a = await api(base, 'GET', '/api/reports/orders-by-status');
  check('orders-by-status includes In Production', a.status === 200 && a.json.some((r) => r.status === 'In Production'), a.json);
  a = await api(base, 'GET', '/api/reports/stock-by-style');
  check('stock-by-style responds', a.status === 200 && a.json.some((r) => r.style === 'LS1'), a.json);

  // cleanup in reverse dependency order
  await api(base, 'DELETE', '/api/quality-checks/' + created.qcId);
  await api(base, 'DELETE', '/api/income-expenses/' + created.ledgerId);
  await api(base, 'DELETE', '/api/batches/' + created.batchId);
  await api(base, 'DELETE', '/api/orders/' + created.orderId);
  await api(base, 'DELETE', '/api/customers/' + created.customerId);

  a = await api(base, 'GET', '/api/customers');
  check('cleanup: customer removed', a.status === 200 && !a.json.some((c) => c.name === 'E2E Test Traders'), a.status);
  a = await api(base, 'GET', '/api/orders');
  check('cleanup: order removed', a.status === 200 && a.json.length === 6, a.json.length);

  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  db.close();
  await new Promise((r) => setTimeout(r, 100));
  console.log('=== E2E RESULT: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E HARNESS ERROR: ' + e.message);
  try { db.close(); } catch (x) {}
  process.exit(2);
});