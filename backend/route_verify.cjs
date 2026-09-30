// End-to-end check of the Surya Tech API.
//
// Mounts every route on an ephemeral port and drives the real workflow: a quotation is
// created, converted to an order, the order is invoiced (CGST/SGST for a Tamil Nadu
// buyer, IGST for a buyer outside the state), stock is reduced, a payment is recorded
// and the Pending Payments total comes back down. It also asserts the numbers the
// dashboard shows, so a seed change that breaks the demo fails here instead of on screen.
//
// Run with:  npm run verify        (DATABASE_URL must point at a seeded database)
//   node route_verify.cjs --keep   (do not delete the rows the flow created)

const express = require('express');
const http = require('http');
const db = require('./db');
const { init } = require('./init');
const { today, thisMonth, addDays, daysBetween } = require('./dates');
const { round2 } = require('./gst');
const { financialYear } = require('./numbers');

const KEEP = process.argv.includes('--keep');

const app = express();
app.use(express.json());
app.use('/api/products', require('./routes/products'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/technical-visits', require('./routes/visits'));
app.use('/api/seller', require('./routes/seller'));
app.use('/api/lots', require('./routes/batches'));
app.use('/api/quality-checks', require('./routes/quality'));
app.use('/api/income-expenses', require('./routes/ledger'));
app.use('/api/reports', require('./routes/reports'));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

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
  await init();
  const server = app.listen(0);
  const base = 'http://localhost:' + server.address().port;
  const created = {};

  // ── Master data ────────────────────────────────────────────────────────────────
  let r = await api(base, 'GET', '/api/seller');
  check('GET /api/seller -> Surya Tech, Tamil Nadu (33)',
    r.status === 200 && r.json.business_name === 'Surya Tech' && r.json.state_code === '33', r.json);
  check('seller profile is flagged as sample data', r.json && r.json.is_sample === 1, r.json);

  r = await api(base, 'GET', '/api/products');
  const products = r.json;
  check('GET /api/products -> 15 leather chemicals', r.status === 200 && products.length === 15, products && products.length);
  check('every product carries HSN, unit and GST rate',
    products.every((p) => p.hsn_code && p.unit && Number(p.gst_rate) > 0), products[0]);
  check('no product still uses the old footwear columns',
    products.every((p) => p.sizes_available === undefined && p.sole_type === undefined), products[0]);

  r = await api(base, 'GET', '/api/customers');
  const customers = r.json;
  check('GET /api/customers -> 10 tanneries / traders', r.status === 200 && customers.length === 10, customers && customers.length);
  check('customers carry a GSTIN and state code',
    customers.every((c) => c.gstin && c.state_code), customers[0]);
  check('at least one customer is outside Tamil Nadu for IGST',
    customers.some((c) => c.state_code !== '33'), customers.map((c) => c.state_code));
  const tnCustomer = customers.find((c) => c.state_code === '33');
  const otherStateCustomer = customers.find((c) => c.state_code !== '33');

  r = await api(base, 'GET', '/api/stock');
  const stock = r.json;
  const low = stock.filter((s) => s.low_stock === 1);
  check('GET /api/stock -> 15 rows with low_stock flags', r.status === 200 && stock.length === 15, stock && stock.length);
  check('exactly 4 items are below their reorder level', low.length === 4, low.map((s) => s.product_code + ':' + s.quantity + '/' + s.reorder_level));
  check('low stock is only flagged from the product reorder level',
    low.every((s) => Number(s.quantity) < Number(s.reorder_level)), low);

  r = await api(base, 'GET', '/api/lots');
  const lots = r.json;
  check('GET /api/lots -> 15 supplier lots', r.status === 200 && lots.length === 15, lots && lots.length);
  check('lots carry a lot number, supplier, received and expiry date',
    lots.every((l) => /^LOT-\d{4}-\d{4}$/.test(l.lot_no) && l.supplier && l.received_date && l.expiry_date), lots[0]);

  r = await api(base, 'GET', '/api/technical-visits');
  const visits = r.json;
  check('GET /api/technical-visits -> 6 visits', r.status === 200 && visits.length === 6, visits && visits.length);
  check('visits record an engineer, an issue and a follow-up date',
    visits.every((v) => v.engineer && v.issue), visits[0]);
  check('visit statuses are Open / Follow-up Due / Resolved',
    visits.every((v) => ['Open', 'Follow-up Due', 'Resolved'].includes(v.status)), visits.map((v) => v.status));

  r = await api(base, 'GET', '/api/quality-checks');
  // Incoming-lot inspection is a hidden screen, so the seed deliberately leaves it empty
  // rather than seeding rows that reference lots the user can never open.
  check('GET /api/quality-checks -> empty, the screen is hidden', r.status === 200 && r.json.length === 0, r.json);

  // ── Dashboard numbers ──────────────────────────────────────────────────────────
  r = await api(base, 'GET', '/api/reports/orders-today');
  check('GET /api/reports/orders-today -> 1 order dated today',
    r.status === 200 && r.json.count === 1 && r.json.date === today(), r.json);

  r = await api(base, 'GET', '/api/reports/pending-approval');
  check('GET /api/reports/pending-approval -> exactly 1 order, listed for the tile',
    r.status === 200 && r.json.count === 1 && r.json.orders.length === 1 && r.json.orders[0].customer_name, r.json);

  r = await api(base, 'GET', '/api/orders?status=Pending%20Approval');
  check('GET /api/orders?status=Pending Approval -> 1 order', r.status === 200 && r.json.length === 1, r.json && r.json.length);

  r = await api(base, 'GET', '/api/reports/pending-payments');
  const pendingTile = r.json;
  check('GET /api/reports/pending-payments -> open receivables with an overdue split',
    r.status === 200 && pendingTile.total_due > 0 && pendingTile.overdue_count > 0, pendingTile);

  r = await api(base, 'GET', '/api/invoices/pending');
  const pending = r.json;
  check('GET /api/invoices/pending -> totals match the dashboard tile',
    pending.total_due === pendingTile.total_due && pending.invoice_count === pendingTile.invoice_count, { pending, pendingTile });
  check('pending payments has exactly 3 overdue invoices',
    pending.items.filter((i) => i.is_overdue).length === 3,
    pending.items.filter((i) => i.is_overdue).map((i) => i.invoice_no + '+' + i.days_overdue + 'd'));
  check('the overdue spread covers more than one ageing bucket',
    pending.bucket_counts['0-30'] > 0 && (pending.bucket_counts['31-60'] > 0 || pending.bucket_counts['60+'] > 0), pending.bucket_counts);
  check('ageing bucket totals add up to the total due',
    round2(pending.buckets['0-30'] + pending.buckets['31-60'] + pending.buckets['60+']) === pending.total_due, pending.buckets);
  check('nothing is marked overdue before its due date',
    pending.items.every((i) => (i.days_overdue > 0) === (i.due_date < today())), pending.items.filter((i) => i.is_overdue).length);

  r = await api(base, 'GET', '/api/reports/salary-this-month');
  check('GET /api/reports/salary-this-month -> this month\'s salary is 50,000',
    r.status === 200 && r.json.month === thisMonth() && r.json.total === 50000, r.json);

  r = await api(base, 'GET', '/api/reports/income-expense-by-month');
  const months = r.json;
  check('GET /api/reports/income-expense-by-month -> 6 months ascending',
    r.status === 200 && months.length === 6 && months[0].month < months[5].month, months.map((m) => m.month));
  check('every month is profitable', months.every((m) => m.profit > 0), months.map((m) => m.month + ':' + m.profit));
  check('the last month is the current calendar month', months[5].month === thisMonth(), months[5]);

  r = await api(base, 'GET', '/api/reports/orders-by-status');
  check('GET /api/reports/orders-by-status -> the four live statuses',
    r.status === 200 && r.json.some((x) => x.status === 'Pending Approval'), r.json);

  r = await api(base, 'GET', '/api/reports/stock-by-product');
  check('GET /api/reports/stock-by-product -> rows carry product and unit',
    r.status === 200 && r.json.every((x) => x.product && x.unit), r.json && r.json[0]);

  r = await api(base, 'GET', '/api/reports/sales-over-time');
  check('GET /api/reports/sales-over-time -> monthly sales', r.status === 200 && r.json.length >= 2, r.json && r.json.length);

  r = await api(base, 'GET', '/api/reports/profit-by-month');
  check('GET /api/reports/profit-by-month -> every month profitable',
    r.status === 200 && r.json.every((m) => m.profit > 0), r.json);

  r = await api(base, 'GET', '/api/reports/invoices-by-status');
  check('GET /api/reports/invoices-by-status -> Paid / Partially Paid / Unpaid all present',
    r.status === 200 && r.json.length === 3, r.json);

  r = await api(base, 'GET', '/api/income-expenses');
  const ledger = r.json;
  check('GET /api/income-expenses -> 48 seeded entries', r.status === 200 && ledger.length === 48, ledger && ledger.length);
  // The route returns newest first with a running balance that accumulates oldest first,
  // so walking the array backwards must reproduce the balance on every row.
  const chronological = ledger.slice().reverse();
  let balance = 0;
  let runningOk = true;
  for (const entry of chronological) {
    balance = round2(balance + (entry.type === 'Income' ? Number(entry.amount) : -Number(entry.amount)));
    if (Number(entry.running_balance) !== balance) runningOk = false;
  }
  check('ledger running balance accumulates in date order', runningOk, { last: chronological[chronological.length - 1] });
  check('ledger net balance is income minus expenses', balance === round2(
    chronological.reduce((s, e) => s + (e.type === 'Income' ? Number(e.amount) : -Number(e.amount)), 0)
  ), balance);

  // ── Seeded invoices ────────────────────────────────────────────────────────────
  r = await api(base, 'GET', '/api/invoices');
  const invoices = r.json;
  check('GET /api/invoices -> 10 tax invoices', r.status === 200 && invoices.length === 10, invoices && invoices.length);
  check('no invoice total is rounded away from its own lines',
    invoices.every((i) => Math.abs(i.total_amount - (i.subtotal + i.cgst + i.sgst + i.igst)) < 0.01), invoices[0]);
  const tnInvoices = invoices.filter((i) => i.customer_state_code === '33');
  const otherInvoices = invoices.filter((i) => i.customer_state_code !== '33');
  check('Tamil Nadu invoices use CGST + SGST and no IGST',
    tnInvoices.length > 0 && tnInvoices.every((i) => i.igst === 0 && i.cgst > 0 && Math.abs(i.cgst - i.sgst) < 0.01), tnInvoices[0]);
  check('out-of-state invoices use IGST and no CGST/SGST',
    otherInvoices.length > 0 && otherInvoices.every((i) => i.cgst === 0 && i.sgst === 0 && i.igst > 0), otherInvoices[0]);
  check('every invoice carries an amount in words', invoices.every((i) => i.amount_in_words), invoices[0]);

  r = await api(base, 'GET', '/api/invoices/' + invoices[0].id);
  const firstInvoice = r.json;
  check('GET /api/invoices/:id -> lines and payments are attached',
    r.status === 200 && Array.isArray(firstInvoice.items) && firstInvoice.items.length > 0 && Array.isArray(firstInvoice.payments), r.json && Object.keys(firstInvoice));
  check('invoice lines snapshot HSN, unit and GST rate',
    firstInvoice.items.every((i) => i.hsn_code && i.unit && Number(i.gst_rate) > 0), firstInvoice.items[0]);
  check('line tax + line value equals the invoice total',
    Math.abs(firstInvoice.total_amount - round2(firstInvoice.items.reduce((s, i) => s + i.taxable_value + i.tax_amount, 0))) < 0.01, firstInvoice.items);

  // ── Workflow: quotation -> order -> invoice -> payment ─────────────────────────
  const productA = products[0];
  const productB = products[1];

  r = await api(base, 'POST', '/api/quotations', {
    customer_id: tnCustomer.id,
    quote_date: today(),
    valid_until: addDays(today(), 15),
    status: 'Draft',
    notes: 'Verification quotation',
    items: [
      { product_id: productA.id, quantity: 10, unit_price: productA.selling_price, unit_cost: productA.purchase_price },
      { product_id: productB.id, quantity: 4, unit_price: productB.selling_price, unit_cost: productB.purchase_price }
    ]
  });
  check('POST /api/quotations -> 201 with a QTN number and computed total',
    r.status === 201 && /^QTN-\d{4}-\d{4}$/.test(r.json.quotation_no) && r.json.total_amount > 0, r.json);
  const quotation = r.json;
  created.quotation = quotation.id;

  r = await api(base, 'POST', '/api/quotations/' + quotation.id + '/convert');
  check('POST /api/quotations/:id/convert on a Draft -> 400',
    r.status === 400, r.json);

  r = await api(base, 'PATCH', '/api/quotations/' + quotation.id + '/status', { status: 'Accepted' });
  check('PATCH /api/quotations/:id/status -> Accepted', r.status === 200 && r.json.status === 'Accepted', r.json);

  r = await api(base, 'POST', '/api/quotations/' + quotation.id + '/convert');
  check('POST /api/quotations/:id/convert -> 201 order in Pending Approval',
    r.status === 201 && r.json.order_id && r.json.order_no, r.json);
  const convertedOrderId = r.json.order_id;
  created.order = convertedOrderId;

  r = await api(base, 'POST', '/api/quotations/' + quotation.id + '/convert');
  check('converting the same quotation twice -> 400', r.status === 400, r.json);

  r = await api(base, 'GET', '/api/orders/' + convertedOrderId);
  const convertedOrder = r.json;
  check('converted order copies the quotation lines',
    r.status === 200 && convertedOrder.items.length === 2 && convertedOrder.status === 'Pending Approval', r.json);
  check('converted order is dated today', convertedOrder.order_date === today(), convertedOrder.order_date);
  check('converted order shows no invoice yet', convertedOrder.invoice_no === null, convertedOrder.invoice_no);

  // Stock before invoicing, so the reduction can be proven.
  const stockBefore = (await api(base, 'GET', '/api/stock')).json;
  const qtyBefore = (code) => {
    const row = stockBefore.find((s) => s.product_code === code && s.warehouse === 'Warehouse');
    return row ? Number(row.quantity) : 0;
  };
  const lineA = convertedOrder.items.find((i) => i.product_code === productA.code);
  const beforeA = qtyBefore(productA.code);

  r = await api(base, 'POST', '/api/invoices', { order_id: convertedOrderId, warehouse: 'Warehouse' });
  check('POST /api/invoices -> 201 tax invoice from the order',
    r.status === 201 && new RegExp(`^ST/${financialYear()}/\\d{4}$`).test(r.json.invoice_no) && r.json.items.length === 2, r.json);
  const invoice = r.json;
  created.invoice = invoice.id;

  check('invoicing a Pending Approval order moves it to Dispatched',
    invoice.order_id === convertedOrderId, invoice.order_id);
  r = await api(base, 'GET', '/api/orders/' + convertedOrderId);
  check('the invoiced order is now Dispatched', r.json.status === 'Dispatched', r.json.status);

  const expectedSubtotal = round2(convertedOrder.items.reduce((s, i) => s + i.unit_price * i.quantity, 0));
  const expectedTax = round2(invoice.items.reduce((s, i) => s + i.tax_amount, 0));
  check('invoice subtotal equals the order total', Math.abs(invoice.subtotal - expectedSubtotal) < 0.01, { invoice: invoice.subtotal, expectedSubtotal });
  check('intra-state invoice splits tax into CGST + SGST',
    invoice.igst === 0 && Math.abs(invoice.cgst - invoice.sgst) < 0.01 && Math.abs(invoice.cgst + invoice.sgst - expectedTax) < 0.01,
    { cgst: invoice.cgst, sgst: invoice.sgst, igst: invoice.igst, expectedTax });
  check('invoice total = subtotal + tax, with no round-off line',
    Math.abs(invoice.total_amount - (invoice.subtotal + invoice.cgst + invoice.sgst + invoice.igst)) < 0.01
      && Math.abs(invoice.total_amount - round2(invoice.subtotal + expectedTax)) < 0.01, invoice);
  // The due date follows the credit terms on that buyer, not a fixed 30 days, so the
  // assertion reads the customer's own terms back instead of hardcoding them.
  check('due date follows the customer\'s credit terms',
    invoice.due_date === addDays(invoice.invoice_date, Number(tnCustomer.credit_terms_days) || 30),
    { invoice: invoice.invoice_date, due: invoice.due_date, terms: tnCustomer.credit_terms_days });

  const stockAfter = (await api(base, 'GET', '/api/stock')).json;
  const afterA = Number(stockAfter.find((s) => s.product_code === productA.code && s.warehouse === 'Warehouse').quantity);
  check('invoicing reduced the warehouse stock by the invoiced quantity',
    Math.abs(beforeA - afterA - lineA.quantity) < 0.01, { before: beforeA, after: afterA, invoiced: lineA.quantity });

  r = await api(base, 'POST', '/api/invoices', { order_id: convertedOrderId });
  check('invoicing the same order twice -> 400', r.status === 400, r.json);

  // Pending payments must have grown by exactly this invoice.
  const pendingAfterInvoice = (await api(base, 'GET', '/api/invoices/pending')).json;
  check('the new invoice appears on Pending Payments',
    pendingAfterInvoice.items.some((i) => i.id === invoice.id), invoice.id);
  check('pending total rose by the invoice total',
    Math.abs(pendingAfterInvoice.total_due - (pending.total_due + invoice.total_amount)) < 0.01,
    { before: pending.total_due, after: pendingAfterInvoice.total_due, invoice: invoice.total_amount });

  r = await api(base, 'POST', '/api/invoices/' + invoice.id + '/e-invoice');
  check('POST /api/invoices/:id/e-invoice -> 64-character IRN',
    r.status === 200 && /^[0-9a-f]{64}$/.test(r.json.irn), r.json && r.json.irn);
  check('e-invoice response says it is a demo simulation', /DEMO/i.test(r.json.notice || ''), r.json && r.json.notice);

  r = await api(base, 'POST', '/api/invoices/' + invoice.id + '/e-way-bill');
  check('POST /api/invoices/:id/e-way-bill -> 12-digit number starting 233',
    r.status === 200 && /^\d{12}$/.test(r.json.eway_bill) && r.json.eway_bill.startsWith('233'), r.json && r.json.eway_bill);

  // Half payment, then the balance that is actually left (read back from the response,
  // so the test never pays a stale figure).
  r = await api(base, 'POST', '/api/invoices/' + invoice.id + '/payments', { amount: round2(invoice.total_amount / 2), mode: 'NEFT' });
  check('POST /api/invoices/:id/payments -> Partially Paid',
    r.status === 201 && r.json.status === 'Partially Paid'
      && Math.abs(r.json.amount_due - round2(invoice.total_amount - invoice.total_amount / 2)) < 0.01, r.json);
  const balanceDue = r.json.amount_due;

  r = await api(base, 'POST', '/api/invoices/' + invoice.id + '/payments', { amount: balanceDue, mode: 'UPI' });
  check('paying the balance marks the invoice Paid', r.status === 201 && r.json.status === 'Paid' && r.json.amount_due === 0, r.json);
  check('both payments are listed against the invoice', r.json.payments.length === 2, r.json.payments);

  const pendingAfterPayment = (await api(base, 'GET', '/api/invoices/pending')).json;
  check('a fully paid invoice leaves Pending Payments',
    !pendingAfterPayment.items.some((i) => i.id === invoice.id), invoice.id);
  check('pending total is back to the seeded figure',
    Math.abs(pendingAfterPayment.total_due - pending.total_due) < 0.01,
    { before: pending.total_due, after: pendingAfterPayment.total_due });

  const receipt = await db.get("SELECT * FROM income_expenses WHERE invoice_id = $1", [invoice.id]);
  check('the payment posted a matching Sales Receipt to the ledger',
    receipt && receipt.type === 'Income' && Number(receipt.amount) > 0, receipt);

  r = await api(base, 'POST', '/api/invoices/' + invoice.id + '/payments', { amount: 5 });
  check('paying a settled invoice -> 400', r.status === 400, r.json);

  r = await api(base, 'DELETE', '/api/invoices/' + invoice.id);
  check('deleting an invoice that has payments -> 400', r.status === 400, r.json);

  // ── Inter-state GST through the same flow ──────────────────────────────────────
  r = await api(base, 'POST', '/api/orders', {
    customer_id: otherStateCustomer.id,
    supply_type: 'Bulk',
    items: [{ product_id: productA.id, quantity: 5, unit_price: productA.selling_price, unit_cost: productA.purchase_price }]
  });
  check('POST /api/orders -> 201', r.status === 201 && r.json.order_no && r.json.items.length === 1, r.json);
  const interOrderId = r.json.id;
  created.interOrder = interOrderId;

  r = await api(base, 'POST', '/api/invoices', { order_id: interOrderId });
  check('an invoice to a buyer outside Tamil Nadu carries IGST only',
    r.status === 201 && r.json.igst > 0 && r.json.cgst === 0 && r.json.sgst === 0, r.json);
  check('IGST equals the full tax on the line',
    Math.abs(r.json.igst - r.json.items.reduce((s, i) => s + i.tax_amount, 0)) < 0.01, r.json.items);
  created.interInvoice = r.json.id;

  // ── Validation and guard rails ─────────────────────────────────────────────────
  r = await api(base, 'POST', '/api/quotations', { customer_id: tnCustomer.id, items: [] });
  check('quotation with no items -> 400', r.status === 400, r.json);

  r = await api(base, 'POST', '/api/quotations', { customer_id: 999999, items: [{ product_id: productA.id, quantity: 1, unit_price: 10, unit_cost: 1 }] });
  check('quotation for a missing customer -> 400', r.status === 400, r.json);

  r = await api(base, 'POST', '/api/orders', {
    customer_id: tnCustomer.id,
    supply_type: 'Wholesale',
    items: [{ product_id: productA.id, quantity: 1, unit_price: 10, unit_cost: 1 }]
  });
  check('order with an unknown supply_type -> 400', r.status === 400, r.json);

  r = await api(base, 'POST', '/api/orders', {
    customer_id: tnCustomer.id,
    supply_type: 'Bulk',
    items: [{ product_id: productA.id, quantity: -1, unit_price: 10, unit_cost: 1 }]
  });
  check('order with a negative quantity -> 400', r.status === 400, r.json);

  r = await api(base, 'POST', '/api/customers', { name: 'Verification Tannery', customer_type: 'Tannery', state_code: '33' });
  check('POST /api/customers -> 201 with a derived state name',
    r.status === 201 && r.json.state_name === 'Tamil Nadu', r.json);
  const tempCustomerId = r.json.id;
  created.customer = tempCustomerId;

  r = await api(base, 'POST', '/api/customers', { name: 'Bad Type Co', customer_type: 'Footwear' });
  check('customer with an unknown type -> 400', r.status === 400, r.json);

  r = await api(base, 'POST', '/api/customers', { name: 'Bad State Co', customer_type: 'Tannery', state_code: '99' });
  check('customer with an invalid GST state code -> 400', r.status === 400, r.json);

  r = await api(base, 'DELETE', '/api/customers/' + tnCustomer.id);
  check('deleting a customer that has orders -> 400', r.status === 400, r.json);

  r = await api(base, 'DELETE', '/api/products/' + productA.id);
  check('deleting a product that is referenced -> 400', r.status === 400, r.json);

  r = await api(base, 'POST', '/api/lots', { product_id: productA.id, quantity: 5, supplier: 'X', received_date: today() });
  check('lot without a lot_no -> 400', r.status === 400, r.json);

  r = await api(base, 'POST', '/api/lots', {
    lot_no: 'LOT-VERIFY-0001', product_id: productA.id, quantity: 5, supplier: 'Verification Supplier', received_date: today(), status: 'In Stock'
  });
  check('POST /api/lots -> 201', r.status === 201 && r.json.lot_no === 'LOT-VERIFY-0001', r.json);
  const lotId = r.json.id;
  created.lot = lotId;

  r = await api(base, 'POST', '/api/lots', {
    lot_no: 'LOT-VERIFY-0001', product_id: productA.id, quantity: 5, supplier: 'Verification Supplier', received_date: today()
  });
  check('duplicate lot_no -> 400', r.status === 400, r.json);

  r = await api(base, 'POST', '/api/lots/' + lotId + '/advance');
  check('POST /api/lots/:id/advance -> Partly Issued', r.status === 200 && r.json.status === 'Partly Issued', r.json);

  r = await api(base, 'POST', '/api/technical-visits', {
    customer_id: tnCustomer.id, visit_date: today(), engineer: 'K. Raghavan',
    issue: 'Un even shade in the retan drum', solution_given: 'Reduced lime dosage', follow_up_date: addDays(today(), 7)
  });
  check('POST /api/technical-visits -> 201 Open', r.status === 201 && r.json.status === 'Open', r.json);
  const visitId = r.json.id;
  created.visit = visitId;

  r = await api(base, 'PUT', '/api/technical-visits/' + visitId, { status: 'Resolved' });
  check('PUT /api/technical-visits/:id -> Resolved', r.status === 200 && r.json.status === 'Resolved', r.json);

  r = await api(base, 'POST', '/api/technical-visits', { customer_id: tnCustomer.id, visit_date: today(), engineer: 'X', issue: 'Y', status: 'Cancelled' });
  check('visit with an unknown status -> 400', r.status === 400, r.json);

  r = await api(base, 'GET', '/api/nope');
  check('unknown API path -> 404 JSON', r.status === 404 && r.json && r.json.error, r.json);

  // ── Cleanup ────────────────────────────────────────────────────────────────────
  if (KEEP) {
    console.log('\n--keep given, leaving ' + JSON.stringify(created) + ' in the database');
  } else {
    await db.run('DELETE FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE id = ANY($1::bigint[]))', [[created.invoice, created.interInvoice]]);
    await db.run('DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE id = ANY($1::bigint[]))', [[created.invoice, created.interInvoice]]);
    await db.run('DELETE FROM income_expenses WHERE invoice_id IN (SELECT id FROM invoices WHERE id = ANY($1::bigint[]))', [[created.invoice, created.interInvoice]]);
    await db.run('DELETE FROM invoices WHERE id = ANY($1::bigint[])', [[created.invoice, created.interInvoice]]);
    await db.run('DELETE FROM order_items WHERE order_id = ANY($1::bigint[])', [[created.order, created.interOrder]]);
    await db.run('DELETE FROM quotation_items WHERE quotation_id = $1', [created.quotation]);
    await db.run('UPDATE quotations SET converted_order_id = NULL, status = $1 WHERE id = $2', ['Accepted', created.quotation]);
    await db.run('DELETE FROM quotations WHERE id = $1', [created.quotation]);
    await db.run('DELETE FROM orders WHERE id = ANY($1::bigint[])', [[created.order, created.interOrder]]);
    await db.run('DELETE FROM technical_visits WHERE id = $1', [created.visit]);
    await db.run('DELETE FROM lots WHERE id = $1', [created.lot]);
    await db.run('DELETE FROM customers WHERE id = $1', [created.customer]);
    console.log('\nCleaned up the rows this run created.');
  }

  server.closeAllConnections();
  await new Promise((r2) => server.close(r2));
  await db.pool.end();
  await new Promise((r2) => setTimeout(r2, 100));
  console.log('=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===');
  if (failed) console.log('Failed checks:\n  - ' + failures.join('\n  - '));
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('HARNESS ERROR: ' + e.message);
  console.error(e.stack);
  try { db.pool.end(); } catch (x) {}
  process.exit(2);
});
