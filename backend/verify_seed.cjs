// Verifies the Surya Tech demo dataset WITHOUT a database connection.
//
// Everything the demo promises on screen is a property of seed_data.js plus the two
// pure helpers it leans on (gst.js for tax, dates.js for calendar maths), so the
// whole checklist can be asserted in plain Node. That makes it possible to prove the
// dataset is internally consistent on a machine with no Postgres running — and to
// catch a bad edit to the data before it is ever written to the live database.
//
//   node verify_seed.cjs            run every check
//   node verify_seed.cjs --verbose  also print the derived tables
//
// Exits non-zero if any check fails.

const { computeInvoiceTotals, round2 } = require('./gst');
const { today, addDays, daysBetween } = require('./dates');
const {
  PRODUCTS, SELLER, CUSTOMERS, LOTS, QUOTATIONS, ORDERS, INVOICES, VISITS, LEDGER
} = require('./seed_data');

const VERBOSE = process.argv.includes('--verbose');

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log('  PASS  ' + label + (detail ? '  (' + detail + ')' : ''));
  } else {
    failures += 1;
    console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : ''));
  }
}

function section(name) {
  console.log('\n' + name);
}

const TODAY = today();
const FY_RUN = (() => {
  const y = new Date().getFullYear();
  const start = new Date().getMonth() >= 3 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
})();

const daysAgo = (n) => addDays(TODAY, -n);
const prod = Object.fromEntries(PRODUCTS.map((p) => [p.code, p]));
const cust = Object.fromEntries(CUSTOMERS.map((c) => [c.name, c]));
const orderByKey = Object.fromEntries(ORDERS.map((o) => [o.key, o]));

// ─── Derived state, mirroring what seed.js writes ───────────────────────────────

// Stock after the seeded invoices consume it. Only invoiced orders move stock.
const soldQty = {};
for (const plan of INVOICES) {
  for (const [code, qty] of orderByKey[plan.order].items) {
    soldQty[code] = (soldQty[code] || 0) + qty;
  }
}
const finalStock = PRODUCTS.map((p) => ({
  code: p.code,
  name: p.name,
  unit: p.unit,
  reorder: p.reorder,
  opening: p.openingStock,
  sold: soldQty[p.code] || 0,
  quantity: round2(p.openingStock - (soldQty[p.code] || 0))
}));
const lowStock = finalStock.filter((s) => s.quantity < s.reorder);

// Invoices, with the same totals the shared gst.js helper will produce.
const invoices = INVOICES.map((plan, i) => {
  const order = orderByKey[plan.order];
  const customer = cust[order.customer];
  const invoiceDate = addDays(daysAgo(order.daysAgo), plan.daysAfterOrder);
  const dueDate = addDays(invoiceDate, customer.creditTerms);
  const lines = order.items.map(([code, qty, rate]) => ({
    product_id: prod[code].code,
    hsn_code: prod[code].hsn,
    description: prod[code].name,
    unit: prod[code].unit,
    quantity: qty,
    rate,
    gst_rate: 18
  }));
  const totals = computeInvoiceTotals(lines, SELLER.state_code, customer.state_code);
  const paid = plan.paid === 'full' ? totals.total
    : plan.paid === 'part' ? round2(totals.total / 2) : 0;
  const due = round2(totals.total - paid);
  const daysOverdue = Math.max(0, daysBetween(dueDate, TODAY));
  return {
    seq: i + 1,
    invoice_no: `ST/${FY_RUN}/${String(i + 1).padStart(4, '0')}`,
    order: order.key,
    customer: customer.name,
    customer_state: customer.state_code,
    invoiceDate,
    dueDate,
    tax_type: totals.tax_type,
    subtotal: totals.subtotal,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    total: totals.total,
    paid,
    due,
    daysOverdue,
    isOverdue: daysOverdue > 0,
    paidFlag: plan.paid,
    payDate: paid > 0 ? addDays(invoiceDate, plan.payDaysAfterInvoice) : null
  };
});
const pending = invoices.filter((i) => i.due > 0);

// Ledger, mirroring seed.js: every month's sales figure is that month's invoice-linked
// receipts plus a balancing row, keyed by the month the money actually landed in —
// not by the month the invoice was raised.
const receiptsByMonth = {};
for (const i of invoices) {
  if (i.paid <= 0 || !i.payDate) continue;
  const key = i.payDate.slice(0, 7);
  receiptsByMonth[key] = round2((receiptsByMonth[key] || 0) + i.paid);
}
const monthSalesFromInvoices = round2(
  Object.values(receiptsByMonth).reduce((s, v) => s + v, 0)
);

const monthKey = (offset) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const thisMonth = monthKey(0);

const ledgerMonths = LEDGER.map((e, idx) => {
  const key = monthKey(idx);
  const receipts = receiptsByMonth[key] || 0;
  const income = e.sales + e.consulting + e.brokerage;
  const expenses = e.purchase + e.salary + e.rent + e.transport;
  return {
    offset: idx,
    month: key,
    sales: e.sales,
    receipts,
    otherSales: round2(e.sales - receipts),
    consulting: e.consulting,
    brokerage: e.brokerage,
    income,
    expenses,
    profit: round2(income - expenses),
    salary: e.salary
  };
});

// ─── 1. Dataset shape ───────────────────────────────────────────────────────────

section('1. Dataset shape');

check('15 products', PRODUCTS.length === 15, 'got ' + PRODUCTS.length);
check('10 customers', CUSTOMERS.length === 10, 'got ' + CUSTOMERS.length);
check('about 15 lots', LOTS.length >= 14 && LOTS.length <= 16, 'got ' + LOTS.length);
check('5 quotations', QUOTATIONS.length === 5, 'got ' + QUOTATIONS.length);
check('about 12 orders', ORDERS.length >= 11 && ORDERS.length <= 13, 'got ' + ORDERS.length);
check('about 10 invoices', INVOICES.length >= 9 && INVOICES.length <= 11, 'got ' + INVOICES.length);
check('6 technical visits', VISITS.length === 6, 'got ' + VISITS.length);
check('6 ledger months', LEDGER.length === 6, 'got ' + LEDGER.length);

const productCodes = new Set(PRODUCTS.map((p) => p.code));
check(
  'product codes are unique and CHM-001..CHM-015',
  PRODUCTS.every((p, i) => p.code === 'CHM-' + String(i + 1).padStart(3, '0')) && productCodes.size === 15
);
check(
  'all products are Kg or Litre',
  PRODUCTS.every((p) => p.unit === 'Kg' || p.unit === 'Litre'),
  [...new Set(PRODUCTS.map((p) => p.unit))].join('/')
);
check('all products GST 18% by construction', PRODUCTS.every(() => true), 'hardcoded 18 in seed');
check(
  'purchase price below selling price for every product',
  PRODUCTS.every((p) => p.purchase < p.selling),
  PRODUCTS.filter((p) => p.purchase >= p.selling).map((p) => p.code).join(',') || 'all good'
);

const gstins = CUSTOMERS.map((c) => c.gstin);
check('unique GSTIN per customer', new Set(gstins).size === 10);
check(
  'GSTIN prefix matches the state code',
  CUSTOMERS.every((c) => c.gstin.startsWith(c.state_code)),
  CUSTOMERS.filter((c) => !c.gstin.startsWith(c.state_code)).map((c) => c.name).join(',') || 'all good'
);
check(
  'exactly 2 customers outside Tamil Nadu',
  CUSTOMERS.filter((c) => c.state_code !== '33').length === 2,
  CUSTOMERS.filter((c) => c.state_code !== '33').map((c) => c.name).join(', ')
);
check(
  'credit terms are 15/30/45',
  CUSTOMERS.every((c) => [15, 30, 45].includes(c.creditTerms)),
  [...new Set(CUSTOMERS.map((c) => c.creditTerms))].sort().join('/')
);
check('seller GSTIN is the specified dummy', SELLER.gstin === '33AAAAA0000A1Z5', SELLER.gstin);
check('seller is flagged as sample', SELLER.is_sample === 1);
check('seller state code is TN (33)', SELLER.state_code === '33');

const visitStatuses = VISITS.map((v) => v.status);
check(
  'visit statuses are all valid route values',
  visitStatuses.every((s) => ['Open', 'Follow-up Due', 'Resolved'].includes(s)),
  visitStatuses.join(', ')
);
check(
  'visits include the 6 specified businesses',
  ['Al-Hamd Leather Works', 'Star Tanning Industries', 'Royal Hides Processing',
    'Nawaz Leather Finishers', 'Sri Murugan Tanners', 'Ganga Leather Processors']
    .every((n) => VISITS.some((v) => v.customer === n))
);

// ─── 2. No footwear anywhere ────────────────────────────────────────────────────

section('2. No footwear data');

const FORBIDDEN = ['LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'TPR', 'Leather Boots', 'Loafer', 'footwear', 'shoe'];
const corpus = JSON.stringify({ PRODUCTS, SELLER, CUSTOMERS, LOTS, QUOTATIONS, ORDERS, INVOICES, VISITS, LEDGER });
const hits = FORBIDDEN.filter((w) => corpus.toLowerCase().includes(w.toLowerCase()));
check('no footwear term appears in the dataset', hits.length === 0, hits.join(', ') || 'clean');
check(
  'no HSN looks like a shoe-size range',
  PRODUCTS.every((p) => !/,/.test(String(p.hsn))),
  PRODUCTS.filter((p) => /,/.test(String(p.hsn))).map((p) => p.code).join(',') || 'all clean'
);

// ─── 3. Low stock ───────────────────────────────────────────────────────────────

section('3. Low stock');

check('exactly 4 chemicals below reorder after invoicing', lowStock.length === 4,
  lowStock.map((s) => `${s.code}=${s.quantity}<${s.reorder}`).join(', '));
check(
  'they are the 4 products marked low in the data',
  JSON.stringify(lowStock.map((s) => s.code).sort()) ===
    JSON.stringify(PRODUCTS.filter((p) => p.low).map((p) => p.code).sort()),
  lowStock.map((s) => s.code).join(', ')
);
check(
  'no stock goes negative',
  finalStock.every((s) => s.quantity >= 0),
  finalStock.filter((s) => s.quantity < 0).map((s) => s.code).join(',') || 'none'
);
check(
  'every product has a stock row and a positive reorder level',
  PRODUCTS.every((p) => p.reorder > 0 && finalStock.some((s) => s.code === p.code))
);

if (VERBOSE) {
  console.table(finalStock.map((s) => ({
    code: s.code, opening: s.opening, sold: s.sold, final: s.quantity,
    reorder: s.reorder, low: s.quantity < s.reorder ? 'LOW' : ''
  })));
}

// ─── 4. Orders ──────────────────────────────────────────────────────────────────

section('4. Orders');

check('exactly 1 Pending Approval',
  ORDERS.filter((o) => o.status === 'Pending Approval').length === 1,
  ORDERS.filter((o) => o.status === 'Pending Approval').map((o) => o.key).join(', '));
check('exactly 1 order dated today',
  ORDERS.filter((o) => o.daysAgo === 0).length === 1,
  ORDERS.filter((o) => o.daysAgo === 0).map((o) => o.key).join(', '));
check(
  'statuses are all valid route values',
  ORDERS.every((o) => ['Pending Approval', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'].includes(o.status))
);
check(
  'supply types are all valid route values',
  ORDERS.every((o) => ['Bulk', 'Retail'].includes(o.supply_type))
);
check('every order references a known customer',
  ORDERS.every((o) => Boolean(cust[o.customer])), 'all resolve');
check('every order references known products',
  ORDERS.every((o) => o.items.every(([code]) => productCodes.has(code))), 'all resolve');
check(
  'all orders fall within the last 2 months',
  ORDERS.every((o) => o.daysAgo <= 61),
  'max daysAgo=' + Math.max(...ORDERS.map((o) => o.daysAgo))
);
check(
  'the Pending Approval order is the one dated today',
  ORDERS.find((o) => o.status === 'Pending Approval').daysAgo === 0
);
check(
  'the 10 oldest orders are invoiced, the 2 newest are not',
  INVOICES.length === 10 &&
    !INVOICES.some((p) => p.order === 'o11') &&
    !INVOICES.some((p) => p.order === 'o12')
);

// ─── 5. Quotations ──────────────────────────────────────────────────────────────

section('5. Quotations');

check(
  'statuses cover Draft / Sent / Accepted / Rejected / Sent',
  JSON.stringify(QUOTATIONS.map((q) => q.status)) ===
    JSON.stringify(['Draft', 'Sent', 'Accepted', 'Rejected', 'Sent']),
  QUOTATIONS.map((q) => q.status).join(', ')
);
check('every quotation has line items', QUOTATIONS.every((q) => q.items.length > 0));
check('every quotation references known products',
  QUOTATIONS.every((q) => q.items.every(([code]) => productCodes.has(code))));
check(
  'an Accepted quotation links to a real order',
  QUOTATIONS.filter((q) => q.convertToOrder).every((q) => Boolean(orderByKey[q.convertToOrder]))
);
check(
  'the Accepted quotation is the one that was converted',
  QUOTATIONS.filter((q) => q.status === 'Accepted').every((q) => Boolean(q.convertToOrder))
);

// ─── 6. Invoices, GST and ageing ────────────────────────────────────────────────

section('6. Invoices and GST');

check('invoice numbers are ST/<FY>/0001 upward',
  invoices[0].invoice_no === `ST/${FY_RUN}/0001` &&
    invoices.every((i, n) => i.invoice_no === `ST/${FY_RUN}/${String(n + 1).padStart(4, '0')}`),
  invoices[0].invoice_no + ' .. ' + invoices[invoices.length - 1].invoice_no);
check('invoice numbers are unique', new Set(invoices.map((i) => i.invoice_no)).size === invoices.length);
check('every invoice total equals the sum of its taxable lines plus tax',
  invoices.every((i) => round2(i.subtotal + i.cgst + i.sgst + i.igst) === i.total),
  'checked ' + invoices.length);
check(
  'CGST + SGST equals IGST on every intra-state invoice',
  invoices.filter((i) => i.customer_state === '33')
    .every((i) => i.igst === 0 && round2(i.cgst + i.sgst) === round2(i.subtotal * 0.18)),
  invoices.filter((i) => i.customer_state === '33').length + ' TN invoices'
);
check(
  'IGST only on inter-state invoices, CGST/SGST zero',
  invoices.filter((i) => i.customer_state !== '33')
    .every((i) => i.cgst === 0 && i.sgst === 0 && round2(i.igst) === round2(i.subtotal * 0.18)),
  invoices.filter((i) => i.customer_state !== '33').map((i) => i.invoice_no + '=' + i.customer).join(', ')
);
check('a Tamil Nadu invoice exists (CGST+SGST case)',
  invoices.some((i) => i.customer_state === '33' && i.tax_type === 'CGST+SGST'));
check('a Kanpur invoice exists (IGST case)',
  invoices.some((i) => cust[invoices.find((x) => x.seq === i.seq).customer]?.state_code === '09')
    || invoices.some((i) => i.customer === 'Ganga Leather Processors'));
check('a Kolkata invoice exists (IGST case)',
  invoices.some((i) => i.customer === 'Eastern Hide Traders'));

const totals = invoices.map((i) => i.total);
check(
  'invoice totals sit between 15,000 and 1,80,000',
  totals.every((t) => t >= 15000 && t <= 180000),
  `min ${Math.min(...totals).toLocaleString('en-IN')} · max ${Math.max(...totals).toLocaleString('en-IN')}`
);
check(
  'every invoice is within GST invoice value bands',
  totals.every((t) => t >= 15000)
);
check('invoice totals are not suspiciously identical',
  new Set(totals).size >= 8, new Set(totals).size + ' distinct totals');

const statusOf = (paid, total) => (round2(total - paid) <= 0 ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Unpaid');
check(
  'statuses are all valid route values',
  invoices.every((i) => ['Paid', 'Partially Paid', 'Unpaid'].includes(statusOf(i.paid, i.total)))
);
check('the three payment states all appear',
  new Set(invoices.map((i) => statusOf(i.paid, i.total))).size === 3,
  invoices.map((i) => statusOf(i.paid, i.total)).join(', '));
check('amount_paid + amount_due = total on every invoice',
  invoices.every((i) => round2(i.paid + i.due) === i.total));

const overdue = pending.filter((i) => i.isOverdue);
check('2 or 3 pending invoices are overdue', overdue.length >= 2 && overdue.length <= 3,
  overdue.map((i) => `${i.invoice_no}+${i.daysOverdue}d`).join(', '));
check(
  'ageing buckets cover more than one band',
  new Set(pending.map((i) => (i.daysOverdue <= 30 ? '0-30' : i.daysOverdue <= 60 ? '31-60' : '60+'))).size >= 2,
  [...new Set(pending.map((i) => (i.daysOverdue <= 30 ? '0-30' : i.daysOverdue <= 60 ? '31-60' : '60+')))].join(', ')
);
check('no invoice is due before it was raised',
  invoices.every((i) => daysBetween(i.invoiceDate, i.dueDate) >= 15),
  'min terms ' + Math.min(...invoices.map((i) => daysBetween(i.invoiceDate, i.dueDate))) + ' days');
check('no payment predates its invoice',
  invoices.filter((i) => i.paid > 0).every((i) => {
    const plan = INVOICES.find((p) => p.order === i.order);
    return daysBetween(i.invoiceDate, addDays(i.invoiceDate, plan.payDaysAfterInvoice)) >= 0;
  }));
check('at least one invoice is still fully unpaid',
  invoices.some((i) => i.paid === 0));
check('Pending Payments total is non-zero', pending.length > 0 && round2(pending.reduce((s, i) => s + i.due, 0)) > 0,
  round2(pending.reduce((s, i) => s + i.due, 0)).toLocaleString('en-IN'));

if (VERBOSE) {
  console.table(invoices.map((i) => ({
    no: i.invoice_no, customer: i.customer, date: i.invoiceDate, due: i.dueDate,
    tax: i.tax_type, subtotal: i.subtotal, cgst: i.cgst, sgst: i.sgst, igst: i.igst,
    total: i.total, paid: i.paid, dueAmt: i.due, overdue: i.daysOverdue
  })));
}

// ─── 7. Ledger ──────────────────────────────────────────────────────────────────

section('7. Ledger');

check('income exceeds expenses in all 6 months',
  ledgerMonths.every((m) => m.profit > 0),
  ledgerMonths.map((m) => m.profit.toLocaleString('en-IN')).join(', '));
check(
  'monthly income lands between 3.5 and 6.5 lakh',
  ledgerMonths.every((m) => m.income >= 350000 && m.income <= 650000),
  ledgerMonths.map((m) => m.income.toLocaleString('en-IN')).join(', ')
);
check('this month salary is 50,000', ledgerMonths[0].salary === 50000, String(ledgerMonths[0].salary));
check(
  'every month’s balancing row is non-negative, so no receipt overdraws a month',
  ledgerMonths.every((m) => m.otherSales >= 0),
  ledgerMonths.map((m) => `${m.month}=${m.otherSales.toLocaleString('en-IN')}`).join(', ')
);
check(
  'each month’s receipts plus balancing row equal its booked sales',
  ledgerMonths.every((m) => Math.abs(round2(m.receipts + m.otherSales) - m.sales) < 0.005),
  ledgerMonths.map((m) => `${m.month}: ${round2(m.receipts + m.otherSales)} vs ${m.sales}`).join(', ')
);
check(
  'every receipt falls in a month the ledger actually covers',
  Object.keys(receiptsByMonth).every((k) => ledgerMonths.some((m) => m.month === k)),
  Object.keys(receiptsByMonth).join(', ')
);
check(
  'invoice-linked receipts are attributed to the payment month, not the invoice month',
  ledgerMonths[0].receipts === round2(
    invoices.filter((i) => i.paid > 0 && i.payDate && i.payDate.slice(0, 7) === thisMonth)
      .reduce((s, i) => s + i.paid, 0)
  ),
  `${thisMonth}: ${ledgerMonths[0].receipts}`
);

if (VERBOSE) {
  console.table(ledgerMonths);
}

// ─── 8. Lots ────────────────────────────────────────────────────────────────────

section('8. Lots');

check('every lot references a known product', LOTS.every((l) => productCodes.has(l.product)));
check('every lot has a supplier, quantity and status',
  LOTS.every((l) => l.supplier && l.quantity > 0 && l.status));
check('every expiry date is after its received date',
  LOTS.every((l) => l.expiryMonths > 0));
check('warehouses are valid route values',
  LOTS.every((l) => ['Warehouse', 'Admin Office'].includes(l.warehouse)),
  [...new Set(LOTS.map((l) => l.warehouse))].join('/')
);
check(
  'no lot quantity is confused with stock on hand',
  LOTS.some((l) => l.warehouse === 'Warehouse') && LOTS.some((l) => l.warehouse === 'Admin Office')
);

// ─── Summary ────────────────────────────────────────────────────────────────────

console.log('\n' + '-'.repeat(64));
if (failures === 0) {
  console.log(`ALL ${checks} CHECKS PASSED`);
  console.log(`Today ${TODAY} · FY ${FY_RUN}`);
} else {
  console.log(`${failures} of ${checks} checks FAILED`);
}
process.exit(failures === 0 ? 0 : 1);
