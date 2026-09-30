// Seed integrity check for the Surya Tech demo.
//
// `route_verify.cjs` drives the API through a full sales workflow and cleans up after
// itself; this script only reads. It asserts the exact figures the dashboard and the
// sales demo depend on, so a change to seed.js that would make the demo look wrong
// fails here instead of on screen.
//
// Run with:  node check_seed.cjs      (DATABASE_URL must point at a seeded database)

const db = require('./db');
const { init } = require('./init');
const { today, thisMonth, daysBetween } = require('./dates');
const { round2 } = require('./gst');
const { financialYear } = require('./numbers');

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

// The demo must never read as leftover footwear data.
const BANNED = /leather\s*stylish|LS\d|shoe|sole_type|sizes_available|pair(s)?\b|sandals?|boot|footwear/i;

async function main() {
  await init();

  // ── Row counts ─────────────────────────────────────────────────────────────────
  // quality_checks is deliberately 0: incoming-lot inspection is a hidden screen, so the
  // seed leaves it empty rather than inserting rows the user can never reach.
  const expected = {
    seller_profile: 1, products: 15, customers: 10, stock_items: 15, orders: 12,
    quotations: 5, invoices: 10, lots: 15, technical_visits: 6, quality_checks: 0, income_expenses: 48
  };
  for (const [table, n] of Object.entries(expected)) {
    const r = await db.get(`SELECT COUNT(*) AS c FROM ${table}`);
    check(`${table} has ${n} row${n === 1 ? '' : 's'}`, r.c === n, { got: r.c, want: n });
  }

  // ── Products are leather chemicals ─────────────────────────────────────────────
  const products = await db.all('SELECT * FROM products ORDER BY code');
  check('every product has an HSN code, a unit and a GST rate',
    products.every((p) => p.hsn_code && p.unit && Number(p.gst_rate) > 0), products[0]);
  check('chemical GST is the 18% slab throughout',
    products.every((p) => Number(p.gst_rate) === 18), [...new Set(products.map((p) => p.gst_rate))]);
  check('selling price is above purchase price on every product',
    products.every((p) => Number(p.selling_price) > Number(p.purchase_price)), products.find((p) => Number(p.selling_price) <= Number(p.purchase_price)));
  check('brands are named (own brand or a supplier brand)',
    products.every((p) => p.brand), products.find((p) => !p.brand));

  // ── Stock: exactly 4 low, one row per product ─────────────────────────────────
  const stock = await db.all(`
    SELECT s.quantity, p.reorder_level FROM stock_items s JOIN products p ON p.id = s.product_id`);
  const low = stock.filter((s) => Number(s.quantity) < Number(s.reorder_level));
  check('exactly 4 stock lines are below their reorder level', low.length === 4, low);
  check('one stock row per product', stock.length === 15, stock.length);

  // ── Orders ─────────────────────────────────────────────────────────────────────
  const orders = await db.all('SELECT * FROM orders ORDER BY order_date, id');
  const byStatus = {};
  for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  check('exactly 1 order is Pending Approval', byStatus['Pending Approval'] === 1, byStatus);
  check('no order is Cancelled', !byStatus.Cancelled, byStatus);
  check('orders use only the live statuses',
    Object.keys(byStatus).every((s) => ['Pending Approval', 'Confirmed', 'Dispatched', 'Delivered'].includes(s)), Object.keys(byStatus));
  check('exactly 1 order is dated today', orders.filter((o) => o.order_date === today()).length === 1,
    orders.filter((o) => o.order_date === today()).map((o) => o.order_no));
  check('the pending-approval order is the one dated today',
    orders.filter((o) => o.status === 'Pending Approval').every((o) => o.order_date === today()), byStatus);
  check('every order total equals the sum of its lines', (await db.all(`
    SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id GROUP BY o.id, o.total_amount
    HAVING ROUND(SUM(oi.unit_price * oi.quantity), 2) <> o.total_amount`)).length === 0);
  check('order supply_type is Bulk or Retail only',
    orders.every((o) => ['Bulk', 'Retail'].includes(o.supply_type)), [...new Set(orders.map((o) => o.supply_type))]);
  check('no order is dated in the future', orders.every((o) => o.order_date <= today()),
    orders.filter((o) => o.order_date > today()).map((o) => o.order_no));

  // ── Invoices and GST ───────────────────────────────────────────────────────────
  const invoices = await db.all(`
    SELECT i.*, c.state_code AS buyer_state FROM invoices i JOIN customers c ON c.id = i.customer_id`);
  check('every invoice total is exactly subtotal + tax', invoices.every(
    (i) => Math.abs(i.total_amount - round2(i.subtotal + i.cgst + i.sgst + i.igst)) < 0.005), invoices[0]);
  const tn = invoices.filter((i) => i.buyer_state === '33');
  const out = invoices.filter((i) => i.buyer_state !== '33');
  check('Tamil Nadu invoices carry CGST + SGST and no IGST',
    tn.length > 0 && tn.every((i) => i.igst === 0 && i.cgst > 0 && Math.abs(i.cgst - i.sgst) <= 0.01), tn[0]);
  check('out-of-state invoices carry IGST and no CGST/SGST',
    out.length > 0 && out.every((i) => i.cgst === 0 && i.sgst === 0 && i.igst > 0), out[0]);
  check('CGST + SGST always re-adds to the tax on the lines', invoices.every((i) =>
    Math.abs(i.cgst + i.sgst + i.igst - i.total_amount + i.subtotal) < 0.005), invoices[0]);
  check('amount_paid + amount_due always equals the total', invoices.every(
    (i) => Math.abs(Number(i.amount_paid) + Number(i.amount_due) - Number(i.total_amount)) < 0.005), invoices[0]);
  check('invoice status agrees with the amounts', invoices.every((i) => {
    const paid = Number(i.amount_paid);
    if (Number(i.amount_due) === 0) return i.status === 'Paid';
    if (paid > 0) return i.status === 'Partially Paid';
    return i.status === 'Unpaid';
  }), invoices.map((i) => i.invoice_no + ':' + i.status + ':' + i.amount_paid));
  check('every invoice has an amount in words', invoices.every((i) => i.amount_in_words), invoices[0]);
  check('invoice numbers follow the financial-year series ST/<FY>/NNNN',
    invoices.every((i) => new RegExp(`^ST/${financialYear()}/\\d{4}$`).test(i.invoice_no)),
    invoices.map((i) => i.invoice_no));
  check('invoice numbers are unique', new Set(invoices.map((i) => i.invoice_no)).size === invoices.length);
  check('no invoice is dated in the future', invoices.every((i) => i.invoice_date <= today()));
  check('paid invoices record at least one payment row', (await db.get(`
    SELECT COUNT(*) AS c FROM invoices i WHERE i.amount_paid > 0
      AND NOT EXISTS (SELECT 1 FROM invoice_payments p WHERE p.invoice_id = i.id)`)).c === 0);

  // ── Ageing buckets ─────────────────────────────────────────────────────────────
  const due = invoices.filter((i) => Number(i.amount_due) > 0);
  const buckets = { '0-30': 0, '31-60': 0, '60+': 0 };
  for (const i of due) {
    const d = Math.max(0, daysBetween(i.due_date, today()));
    buckets[d <= 30 ? '0-30' : d <= 60 ? '31-60' : '60+'] = round2(buckets[d <= 30 ? '0-30' : d <= 60 ? '31-60' : '60+'] + Number(i.amount_due));
  }
  const totalDue = round2(due.reduce((s, i) => s + Number(i.amount_due), 0));
  check('ageing bucket totals add up to the open receivable',
    round2(buckets['0-30'] + buckets['31-60'] + buckets['60+']) === totalDue, { buckets, totalDue });
  check('at least one invoice is overdue', due.some((i) => i.due_date < today()), due.map((i) => i.invoice_no + ' ' + i.due_date));
  check('exactly 3 pending invoices are overdue', due.filter((i) => i.due_date < today()).length === 3,
    due.map((i) => i.invoice_no + (i.due_date < today() ? ' OVERDUE' : '')));
  check('the overdue spread covers more than one ageing band',
    new Set(due.filter((i) => i.due_date < today())
      .map((i) => { const d = daysBetween(i.due_date, today()); return d <= 30 ? '0-30' : d <= 60 ? '31-60' : '60+'; })).size > 1,
    buckets);

  // ── Ledger ─────────────────────────────────────────────────────────────────────
  const months = await db.all(`
    SELECT substr(entry_date, 1, 7) AS month,
           ROUND(SUM(CASE WHEN type = 'Income'  THEN amount ELSE 0 END), 2) AS income,
           ROUND(SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END), 2) AS expenses
    FROM income_expenses GROUP BY month ORDER BY month`);
  check('the ledger covers 6 months', months.length === 6, months.map((m) => m.month));
  check('the newest ledger month is the current month', months[5].month === thisMonth(), months[5]);
  check('every month is profitable', months.every((m) => m.income - m.expenses > 0), months.map((m) => m.month));
  check('monthly income sits between 3.5L and 6.5L', months.every((m) => m.income >= 350000 && m.income <= 650000), months.map((m) => m.income));
  const salary = await db.get(`
    SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS t FROM income_expenses
    WHERE type = 'Expense' AND lower(COALESCE(category, '')) LIKE '%salary%' AND substr(entry_date, 1, 7) = $1`, [thisMonth()]);
  check("this month's salary is 50,000", Number(salary.t) === 50000, salary.t);
  check('no ledger entry is dated in the future',
    (await db.get("SELECT COUNT(*) AS c FROM income_expenses WHERE entry_date > $1", [today()])).c === 0);

  // ── Quotations, lots, visits ───────────────────────────────────────────────────
  const quotations = await db.all('SELECT * FROM quotations ORDER BY id');
  check('quotations cover Draft / Sent / Accepted / Rejected', new Set(quotations.map((q) => q.status)).size === 4,
    quotations.map((q) => q.status));
  check('every quotation total equals the sum of its lines', (await db.get(`
    SELECT COUNT(*) AS c FROM (
      SELECT q.id, q.total_amount, ROUND(SUM(qi.unit_price * qi.quantity), 2) AS line_total
      FROM quotations q JOIN quotation_items qi ON qi.quotation_id = q.id
      GROUP BY q.id, q.total_amount) t WHERE t.total_amount <> t.line_total`)).c === 0);
  check('no quotation is dated in the future', quotations.every((q) => q.quote_date <= today()));
  check('a converted quotation points at a real order', quotations.every((q) =>
    q.converted_order_id === null || orders.some((o) => o.id === q.converted_order_id)), quotations.filter((q) => q.converted_order_id));

  const lots = await db.all('SELECT * FROM lots ORDER BY id');
  check('every lot has a lot number, supplier, received date and expiry date',
    lots.every((l) => /^LOT-\d{4}-\d{4}$/.test(l.lot_no) && l.supplier && l.received_date && l.expiry_date), lots[0]);
  check('lot numbers are unique', new Set(lots.map((l) => l.lot_no)).size === lots.length);
  check('every lot expiry is after its received date', lots.every((l) => l.expiry_date > l.received_date));
  check('lot statuses are Received / In Stock / Partly Issued / Expired',
    lots.every((l) => ['Received', 'In Stock', 'Partly Issued', 'Expired'].includes(l.status)), [...new Set(lots.map((l) => l.status))]);
  check('no lot is dated in the future', lots.every((l) => l.received_date <= today()));

  const visits = await db.all('SELECT * FROM technical_visits ORDER BY id');
  check('every visit records an engineer, an issue and a follow-up date',
    visits.every((v) => v.engineer && v.issue && v.follow_up_date), visits[0]);
  check('visit statuses are Open / Follow-up Due / Resolved',
    visits.every((v) => ['Open', 'Follow-up Due', 'Resolved'].includes(v.status)), [...new Set(visits.map((v) => v.status))]);
  check('no visit is dated in the future', visits.every((v) => v.visit_date <= today()));
  check('resolved visits are not left without a solution', visits.every((v) => v.status !== 'Resolved' || v.solution_given),
    visits.filter((v) => v.status === 'Resolved' && !v.solution_given));

  // ── Customer and seller master ────────────────────────────────────────────────
  const customers = await db.all('SELECT * FROM customers');
  check('every customer has a GSTIN and a state code', customers.every((c) => c.gstin && c.state_code), customers[0]);
  check('GSTINs are unique', new Set(customers.map((c) => c.gstin)).size === customers.length);
  check('customer types are Tannery / Wholesale / Retail',
    customers.every((c) => ['Tannery', 'Wholesale', 'Retail'].includes(c.customer_type)), [...new Set(customers.map((c) => c.customer_type))]);
  check('at least one customer is outside Tamil Nadu, so IGST is exercised',
    customers.some((c) => c.state_code !== '33') && customers.some((c) => c.state_code === '33'));
  check('every customer carries credit terms of 15, 30 or 45 days',
    customers.every((c) => [15, 30, 45].includes(Number(c.credit_terms_days))),
    customers.map((c) => `${c.name}=${c.credit_terms_days}`));
  check('credit terms use all three bands, so ageing differs between buyers',
    new Set(customers.map((c) => Number(c.credit_terms_days))).size === 3,
    [...new Set(customers.map((c) => Number(c.credit_terms_days)))].join('/'));

  const seller = await db.get('SELECT * FROM seller_profile ORDER BY id LIMIT 1');
  check('the seller is Surya Tech in Tamil Nadu',
    seller && seller.business_name === 'Surya Tech' && seller.state_code === '33' && seller.state === 'Tamil Nadu', seller);
  check('the seller profile is flagged as sample data', seller.is_sample === 1);
  check('the seller GSTIN and city are filled in', seller.gstin && seller.city && seller.district, seller);

  // ── No leftover footwear wording anywhere in the data ──────────────────────────
  const text = await db.all(`
    SELECT string_agg(t, ' ') AS blob FROM (
      SELECT name AS t FROM products UNION ALL SELECT location FROM customers UNION ALL
      SELECT business_name || ' ' || address || ' ' || city FROM seller_profile UNION ALL
      SELECT supplier FROM lots UNION ALL SELECT issue || ' ' || COALESCE(solution_given, '') FROM technical_visits UNION ALL
      SELECT notes FROM quotations UNION ALL SELECT COALESCE(note, '') FROM income_expenses) s`);
  const blob = (text[0] && text[0].blob) || '';
  const hit = blob.match(BANNED);
  check('no footwear wording survives in the seeded text', !hit, hit ? hit[0] : null);

  console.log('\n=== SEED CHECK: ' + passed + ' passed, ' + failed + ' failed ===');
  if (failed) console.log('Failed checks:\n  - ' + failures.join('\n  - '));
  await db.pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error('SEED CHECK ERROR: ' + e.message);
  try { await db.pool.end(); } catch (x) {}
  process.exit(2);
});
