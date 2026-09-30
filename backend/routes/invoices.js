const express = require('express');
const db = require('../db');
const { today: todayISO, addDays: addDaysISO, daysBetween } = require('../dates');
const { computeInvoiceTotals, paymentStatus, round2 } = require('../gst');
const { nextFyDocNo } = require('../numbers');
const { DEMO_NOTICE, generateIRN, generateEWayBill } = require('../services/gstPortal');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const STATUSES = ['Paid', 'Partially Paid', 'Unpaid'];
const PAYMENT_MODES = ['NEFT', 'RTGS', 'Cheque', 'Cash', 'UPI'];

// Fallback credit period when a customer master row carries no terms of its own.
const DEFAULT_CREDIT_DAYS = 30;

// The seller's own state decides intra-state (CGST + SGST) vs inter-state (IGST).
async function seller() {
  const row = await db.get('SELECT * FROM seller_profile ORDER BY id LIMIT 1');
  if (!row) return { business_name: 'Surya Tech', state_code: '33', gstin: '33AAAAA0000A1Z5' };
  return row;
}

const LIST_SELECT = `
  SELECT i.*, c.name AS customer_name, c.location AS customer_location, c.state_code AS customer_state_code,
    o.order_no,
    (SELECT COUNT(*) FROM invoice_payments p WHERE p.invoice_id = i.id) AS payment_count
  FROM invoices i
  JOIN customers c ON i.customer_id = c.id
  LEFT JOIN orders o ON i.order_id = o.id
`;

async function getDetail(id) {
  const invoice = await db.get(LIST_SELECT + ' WHERE i.id = $1', [id]);
  if (!invoice) return null;
  invoice.items = await db.all(`
    SELECT ii.*, p.code AS product_code
    FROM invoice_items ii LEFT JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = $1 ORDER BY ii.id`, [id]);
  invoice.payments = await db.all('SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY payment_date, id', [id]);
  invoice.demo_notice = DEMO_NOTICE;
  return invoice;
}

const addDays = addDaysISO;

// Building the invoice (and the stock it consumes) is one transaction, so a failure
// halfway through can never leave stock reduced without the invoice that explains it.
async function createInvoiceFromOrder({ order, customer, sellerRow, invoice_date, due_date, warehouse }) {
  const orderItems = await db.all(`
    SELECT oi.*, p.name AS product_name, p.hsn_code, p.unit, p.gst_rate
    FROM order_items oi JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = $1 ORDER BY oi.id`, [order.id]);
  if (!orderItems.length) throw Object.assign(new Error('This order has no line items to invoice'), { status: 400 });

  // HSN, unit and GST rate are snapshotted onto the invoice line so a later product
  // price or rate change never rewrites a tax document that has already been issued.
  const totals = computeInvoiceTotals(
    orderItems.map((it) => ({
      product_id: it.product_id,
      hsn_code: it.hsn_code,
      description: it.product_name,
      unit: it.unit,
      quantity: it.quantity,
      rate: it.unit_price,
      gst_rate: it.gst_rate
    })),
    sellerRow.state_code,
    customer.state_code
  );

  const date = invoice_date || todayISO();
  // The due date follows the credit terms on the customer master (15/30/45 days),
  // so an invoice to a 15-day buyer ages into the overdue buckets sooner.
  const creditDays = Number(customer.credit_terms_days) > 0 ? Number(customer.credit_terms_days) : DEFAULT_CREDIT_DAYS;

  return db.tx(async (x) => {
    const invoice_no = await nextFyDocNo(x, 'ST', 'invoices', 'invoice_no');
    const status = paymentStatus(0, totals.total);

    const info = await x.run(`INSERT INTO invoices
      (invoice_no, order_id, customer_id, invoice_date, due_date, status, place_of_supply,
       seller_gstin, buyer_gstin, subtotal, cgst, sgst, igst, total_amount, amount_paid,
       amount_due, amount_in_words)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0, $14, $15)
      RETURNING id`,
      [
        invoice_no, order.id, customer.id, date, due_date || addDays(date, creditDays), status,
        totals.place_of_supply, sellerRow.gstin, customer.gstin, totals.subtotal,
        totals.cgst, totals.sgst, totals.igst, totals.total, totals.amount_in_words
      ]
    );

    for (const line of totals.items) {
      await x.run(`INSERT INTO invoice_items
        (invoice_id, product_id, hsn_code, description, unit, quantity, rate, taxable_value, gst_rate, tax_amount)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          info.lastId, line.product_id, line.hsn_code, line.description, line.unit,
          line.quantity, line.rate, line.taxable_value, line.gst_rate, line.tax_amount
        ]);

      // Stock leaves the place the invoice was dispatched from. One stock row per
      // product in the demo, but fall back to any row so an invoice can never be
      // raised without the matching stock movement.
      const target = await x.get(
        'SELECT id FROM stock_items WHERE product_id = $1 AND warehouse = $2 ORDER BY id LIMIT 1',
        [line.product_id, warehouse]
      ) || await x.get('SELECT id FROM stock_items WHERE product_id = $1 ORDER BY id LIMIT 1', [line.product_id]);
      if (target) {
        await x.run('UPDATE stock_items SET quantity = ROUND(quantity - $1, 2) WHERE id = $2', [line.quantity, target.id]);
      }
    }

    return info.lastId;
  });
}

router.get('/', wrap(async (req, res) => {
  const { status, customer_id } = req.query;
  let sql = LIST_SELECT + ' WHERE 1=1';
  const params = [];
  if (status) {
    sql += ' AND i.status = $' + (params.length + 1);
    params.push(status);
  }
  if (customer_id) {
    sql += ' AND i.customer_id = $' + (params.length + 1);
    params.push(customer_id);
  }
  sql += ' ORDER BY i.invoice_date DESC, i.id DESC';
  res.json(await db.all(sql, params));
}));

// The Pending Payments screen: everything still owing, with the ageing the buyer
// cares about. Ageing is measured from the due date — not overdue is 0 days.
router.get('/pending', wrap(async (req, res) => {
  const today = todayISO();
  const rows = await db.all(`
    SELECT i.id, i.invoice_no, i.invoice_date, i.due_date, i.total_amount, i.amount_paid, i.amount_due,
           i.status, c.name AS customer_name, c.location AS customer_location, c.state_code AS customer_state_code
    FROM invoices i JOIN customers c ON i.customer_id = c.id
    WHERE i.amount_due > 0
    ORDER BY i.due_date, i.id
  `);

  const items = rows.map((r) => {
    const days_overdue = Math.max(0, daysBetween(r.due_date, today));
    return {
      ...r,
      days_overdue,
      bucket: days_overdue <= 30 ? '0-30' : days_overdue <= 60 ? '31-60' : '60+',
      is_overdue: days_overdue > 0
    };
  });

  const total = round2(items.reduce((s, r) => s + Number(r.amount_due), 0));
  const overdue_total = round2(items.filter((r) => r.is_overdue).reduce((s, r) => s + Number(r.amount_due), 0));
  const buckets = { '0-30': 0, '31-60': 0, '60+': 0 };
  const bucket_counts = { '0-30': 0, '31-60': 0, '60+': 0 };
  for (const r of items) {
    buckets[r.bucket] = round2(buckets[r.bucket] + Number(r.amount_due));
    bucket_counts[r.bucket] += 1;
  }

  res.json({ as_of: today, total_due: total, overdue_total, invoice_count: items.length, buckets, bucket_counts, items });
}));

router.get('/:id', wrap(async (req, res) => {
  const invoice = await getDetail(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
}));

// Raise a GST invoice from a confirmed order. Stock is reduced and the amount
// becomes a receivable on the Pending Payments screen.
router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.order_id) return res.status(400).json({ error: 'order_id is required' });
  const order = await db.get('SELECT * FROM orders WHERE id = $1', [b.order_id]);
  if (!order) return res.status(400).json({ error: 'order_id does not exist' });

  const existing = await db.get('SELECT invoice_no FROM invoices WHERE order_id = $1', [order.id]);
  if (existing) {
    return res.status(400).json({ error: `Order ${order.order_no} is already invoiced as ${existing.invoice_no}` });
  }
  if (order.status === 'Cancelled') {
    return res.status(400).json({ error: 'A cancelled order cannot be invoiced' });
  }

  const customer = await db.get('SELECT * FROM customers WHERE id = $1', [order.customer_id]);
  if (!customer) return res.status(400).json({ error: 'Order has no valid customer' });
  const sellerRow = await seller();

  const id = await createInvoiceFromOrder({
    order,
    customer,
    sellerRow,
    invoice_date: b.invoice_date,
    due_date: b.due_date,
    warehouse: b.warehouse || 'Warehouse'
  });

  // An invoiced order has left the racks, so it is no longer waiting for approval.
  if (order.status === 'Pending Approval') {
    await db.run("UPDATE orders SET status = 'Dispatched' WHERE id = $1", [order.id]);
  }
  res.status(201).json(await getDetail(id));
}));

// Record a receipt against an invoice: updates the invoice status and posts a matching
// income entry to the cash ledger so the dashboard reflects the collection.
router.post('/:id/payments', wrap(async (req, res) => {
  const invoice = await db.get('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const b = req.body || {};
  const amount = round2(Number(b.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (amount > round2(invoice.amount_due) + 0.01) {
    return res.status(400).json({ error: `Amount is more than the ₹${Number(invoice.amount_due).toFixed(2)} still due` });
  }
  const mode = b.mode || 'NEFT';
  if (!PAYMENT_MODES.includes(mode)) return res.status(400).json({ error: `mode must be one of ${PAYMENT_MODES.join(', ')}` });
  const payment_date = b.payment_date || todayISO();

  await db.tx(async (x) => {
    await x.run(
      'INSERT INTO invoice_payments (invoice_id, payment_date, amount, mode, note) VALUES ($1, $2, $3, $4, $5)',
      [invoice.id, payment_date, amount, mode, b.note || null]
    );
    const paid = round2(Number(invoice.amount_paid) + amount);
    const total = round2(invoice.total_amount);
    const due = round2(total - paid);
    await x.run('UPDATE invoices SET amount_paid = $1, amount_due = $2, status = $3 WHERE id = $4',
      [paid, due, paymentStatus(paid, total), invoice.id]);
    await x.run('UPDATE orders SET payment_status = $1 WHERE id = $2',
      [paymentStatus(paid, total) === 'Paid' ? 'Paid' : 'Partial', invoice.order_id]);
    await x.run(
      `INSERT INTO income_expenses (entry_date, type, category, amount, note, invoice_id)
       VALUES ($1, 'Income', 'Sales Receipt', $2, $3, $4)`,
      [payment_date, amount, `Payment against invoice ${invoice.invoice_no} (${mode})`, invoice.id]
    );
  });

  res.status(201).json(await getDetail(invoice.id));
}));

// Demo e-invoice / e-way bill. Both are minted locally by services/gstPortal.js and
// stored on the invoice; nothing is sent to the GST portal.
router.post('/:id/e-invoice', wrap(async (req, res) => {
  const invoice = await db.get('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const { irn, generated_at } = generateIRN({
    invoice_no: invoice.invoice_no,
    seller_gstin: invoice.seller_gstin,
    buyer_gstin: invoice.buyer_gstin,
    invoice_date: invoice.invoice_date,
    total: invoice.total_amount
  });
  await db.run('UPDATE invoices SET irn = $1, irn_generated_at = $2 WHERE id = $3', [irn, generated_at.slice(0, 10), invoice.id]);
  res.json({ ...(await getDetail(invoice.id)), notice: DEMO_NOTICE });
}));

router.post('/:id/e-way-bill', wrap(async (req, res) => {
  const invoice = await db.get('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const { eway_bill, generated_at, mode } = generateEWayBill({
    seller_gstin: invoice.seller_gstin,
    total: invoice.total_amount,
    mode: (req.body || {}).mode
  });
  await db.run('UPDATE invoices SET eway_bill = $1, eway_generated_at = $2 WHERE id = $3', [eway_bill, generated_at.slice(0, 10), invoice.id]);
  res.json({ ...(await getDetail(invoice.id)), notice: DEMO_NOTICE, eway_mode: mode });
}));

router.delete('/:id', wrap(async (req, res) => {
  const invoice = await db.get('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  // ASSUMPTION-NEEDED: a tax document with recorded payments is never deleted — the
  // demo blocks it so a paid invoice cannot disappear from the receivables.
  if (Number(invoice.amount_paid) > 0) {
    return res.status(400).json({ error: 'Cannot delete: this invoice has recorded payments.' });
  }
  await db.tx(async (x) => {
    await x.run('DELETE FROM invoice_payments WHERE invoice_id = $1', [invoice.id]);
    await x.run('DELETE FROM invoice_items WHERE invoice_id = $1', [invoice.id]);
    await x.run('DELETE FROM invoices WHERE id = $1', [invoice.id]);
  });
  res.json({ deleted: true, id: Number(invoice.id) });
}));

module.exports = router;
module.exports.STATUSES = STATUSES;
