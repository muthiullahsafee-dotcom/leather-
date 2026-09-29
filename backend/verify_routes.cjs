// Live-server smoke test for the Surya Tech API.
//
// `route_verify.cjs` mounts the routes in-process; this one talks to a server that is
// actually running, which is what the demo does. It only issues GET requests, so it
// can be run against a running demo without changing any data.
//
// Usage:  node verify_routes.cjs [baseUrl]     (default http://localhost:3001)

const http = require('http');
const { URL } = require('url');

const BASE = process.argv[2] || process.env.API_URL || 'http://localhost:3001';

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

function get(path) {
  return new Promise((resolve) => {
    const u = new URL(path, BASE);
    const req = http.request(u, { method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, raw: data });
      });
    });
    req.on('error', (e) => resolve({ status: 0, json: null, error: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, json: null, error: 'timeout' }); });
    req.end();
  });
}

// Every read-only endpoint the app's sidebar depends on, with a shape assertion.
const ROUTES = [
  ['/api/health', (j) => j && j.status === 'ok'],
  ['/api/seller', (j) => j && j.business_name === 'Surya Tech' && j.state_code],
  ['/api/products', (j) => Array.isArray(j) && j.length > 0 && j.every((p) => p.hsn_code && p.gst_rate !== null)],
  ['/api/customers', (j) => Array.isArray(j) && j.length > 0 && j.every((c) => c.gstin && c.state_name)],
  ['/api/stock', (j) => Array.isArray(j) && j.length > 0 && j.every((s) => 'low_stock' in s)],
  ['/api/orders', (j) => Array.isArray(j) && j.length > 0 && j.every((o) => o.order_no && o.customer_name)],
  ['/api/quotations', (j) => Array.isArray(j) && j.length > 0 && j.every((q) => q.quotation_no && q.customer_name)],
  ['/api/invoices', (j) => Array.isArray(j) && j.length > 0 && j.every((i) => i.invoice_no && i.customer_name)],
  ['/api/lots', (j) => Array.isArray(j) && j.length > 0 && j.every((l) => l.lot_no && l.supplier)],
  ['/api/technical-visits', (j) => Array.isArray(j) && j.length > 0 && j.every((v) => v.engineer && v.customer_name)],
  ['/api/quality-checks', (j) => Array.isArray(j) && j.length > 0],
  ['/api/income-expenses', (j) => Array.isArray(j) && j.length > 0 && j.every((e) => 'running_balance' in e)],
  ['/api/reports/sales-over-time', (j) => Array.isArray(j) && j.length > 0 && j.every((m) => m.month && 'sales' in m)],
  ['/api/reports/profit-by-month', (j) => Array.isArray(j) && j.length > 0 && j.every((m) => 'profit' in m)],
  ['/api/reports/stock-by-product', (j) => Array.isArray(j) && j.length > 0 && j.every((s) => s.product && s.unit)],
  ['/api/reports/orders-by-status', (j) => Array.isArray(j) && j.length > 0],
  ['/api/reports/invoices-by-status', (j) => Array.isArray(j) && j.length > 0],
  ['/api/reports/income-expense-by-month', (j) => Array.isArray(j) && j.length === 6],
  ['/api/reports/salary-this-month', (j) => j && typeof j.total === 'number' && j.total > 0],
  ['/api/reports/pending-payments', (j) => j && typeof j.total_due === 'number'],
  ['/api/reports/orders-today', (j) => j && typeof j.count === 'number' && typeof j.date === 'string'],
  ['/api/reports/pending-approval', (j) => j && typeof j.count === 'number' && Array.isArray(j.orders)],
  ['/api/invoices/pending', (j) => j && typeof j.total_due === 'number' && Array.isArray(j.items)
    && j.buckets && j.buckets['0-30'] !== undefined && j.buckets['31-60'] !== undefined && j.buckets['60+'] !== undefined]
];

async function main() {
  console.log('Smoke testing ' + BASE + '\n');

  const health = await get('/api/health');
  if (health.status !== 200) {
    console.log('Cannot reach the API at ' + BASE + ' (' + (health.error || 'HTTP ' + health.status) + ')');
    console.log('Start it first:  cd backend && npm start');
    process.exit(2);
  }

  for (const [path, shape] of ROUTES) {
    const r = await get(path);
    check('GET ' + path + ' -> 200 with the expected shape', r.status === 200 && shape(r.json), r.status !== 200 ? r : r.json && Object.keys(r.json).slice(0, 6));
  }

  // Detail routes need an id from the list.
  const orders = (await get('/api/orders')).json;
  const invoices = (await get('/api/invoices')).json;
  const quotations = (await get('/api/quotations')).json;
  const lots = (await get('/api/lots')).json;
  const visits = (await get('/api/technical-visits')).json;
  const customers = (await get('/api/customers')).json;

  if (orders && orders[0]) {
    const r = await get('/api/orders/' + orders[0].id);
    check('GET /api/orders/:id -> 200 with line items', r.status === 200 && Array.isArray(r.json.items) && r.json.items.length > 0, r.status);
  }
  if (invoices && invoices[0]) {
    const r = await get('/api/invoices/' + invoices[0].id);
    check('GET /api/invoices/:id -> 200 with lines and payments',
      r.status === 200 && Array.isArray(r.json.items) && Array.isArray(r.json.payments) && r.json.demo_notice, r.status);
  }
  if (quotations && quotations[0]) {
    const r = await get('/api/quotations/' + quotations[0].id);
    check('GET /api/quotations/:id -> 200 with line items', r.status === 200 && Array.isArray(r.json.items) && r.json.items.length > 0, r.status);
  }
  if (lots && lots[0]) {
    const r = await get('/api/lots/' + lots[0].id);
    check('GET /api/lots/:id -> 200', r.status === 200 && r.json.lot_no === lots[0].lot_no, r.status);
  }
  if (visits && visits[0]) {
    const r = await get('/api/technical-visits/' + visits[0].id);
    check('GET /api/technical-visits/:id -> 200', r.status === 200 && r.json.engineer === visits[0].engineer, r.status);
  }
  if (customers && customers[0]) {
    const r = await get('/api/customers/' + customers[0].id + '/orders');
    check('GET /api/customers/:id/orders -> 200 with orders and invoices',
      r.status === 200 && Array.isArray(r.json.orders) && Array.isArray(r.json.invoices), r.status);
  }

  // Filters the screens actually use.
  const filtered = await get('/api/orders?status=Confirmed');
  check('GET /api/orders?status=Confirmed -> only confirmed orders',
    filtered.status === 200 && filtered.json.every((o) => o.status === 'Confirmed'), filtered.json && filtered.json.length);
  const low = await get('/api/stock?low=1');
  check('GET /api/stock?low=1 -> only below reorder level',
    low.status === 200 && low.json.length > 0 && low.json.every((s) => s.low_stock === 1), low.json && low.json.length);
  const open = await get('/api/quotations?status=Accepted');
  check('GET /api/quotations?status=Accepted -> only accepted quotations',
    open.status === 200 && open.json.every((q) => q.status === 'Accepted'), open.json && open.json.length);

  const missing = await get('/api/orders/999999');
  check('GET a missing record -> 404 JSON, not a crash',
    missing.status === 404 && missing.json && missing.json.error, missing.json);
  const unknown = await get('/api/does-not-exist');
  check('GET an unknown path -> 404 JSON', unknown.status === 404 && unknown.json && unknown.json.error, unknown.json);

  console.log('\n=== LIVE SERVER: ' + passed + ' passed, ' + failed + ' failed ===');
  if (failed) console.log('Failed checks:\n  - ' + failures.join('\n  - '));
  process.exit(failed ? 1 : 0);
}

main();
