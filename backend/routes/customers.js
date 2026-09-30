const express = require('express');
const db = require('../db');
const { stateName } = require('../gst');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Surya Tech sells to tanneries and leather merchants. The buyer's GST state code
// decides whether an invoice is intra-state (CGST + SGST) or inter-state (IGST), so
// it is part of the customer master. credit_terms_days is the credit period agreed
// with that buyer and sets the due date on their invoices.
const VALID_TYPES = ['Tannery', 'Wholesale', 'Retail'];

// Credit terms a tannery can be offered. Anything else is rejected so a bad value
// can never turn into an invoice due date of zero days.
const CREDIT_TERMS = [15, 30, 45];

// The GST state name is derived from the stored code, so it is never a stored column.
// The list also carries the customer's open amount so the Customers screen can show
// who still owes money.
const LIST_SELECT = `
  SELECT c.*,
         (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
         (SELECT COALESCE(SUM(i.amount_due), 0) FROM invoices i WHERE i.customer_id = c.id) AS amount_due
  FROM customers c
`;

function withState(row) {
  if (!row) return row;
  return { ...row, state_name: stateName(row.state_code) };
}

router.get('/', wrap(async (req, res) => {
  const rows = await db.all(LIST_SELECT + ' ORDER BY c.name');
  res.json(rows.map(withState));
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Customer not found' });
  res.json(withState(row));
}));

router.get('/:id/orders', wrap(async (req, res) => {
  const customer = await db.get('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const orders = await db.all('SELECT * FROM orders WHERE customer_id = $1 ORDER BY order_date DESC', [req.params.id]);
  const invoices = await db.all('SELECT * FROM invoices WHERE customer_id = $1 ORDER BY invoice_date DESC', [req.params.id]);
  res.json({ customer: withState(customer), orders, invoices });
}));

function validate(b, next) {
  if (!next.name || !next.customer_type) return 'name and customer_type are required';
  if (!VALID_TYPES.includes(next.customer_type)) return `customer_type must be one of ${VALID_TYPES.join(', ')}`;
  if (next.state_code && !stateName(next.state_code)) return 'state_code must be a valid GST state code';
  if (next.credit_terms_days !== null && next.credit_terms_days !== undefined && next.credit_terms_days !== '') {
    if (!CREDIT_TERMS.includes(Number(next.credit_terms_days))) {
      return `credit_terms_days must be one of ${CREDIT_TERMS.join(', ')}`;
    }
  }
  return null;
}

router.post('/', wrap(async (req, res) => {
  const { name, phone, location, customer_type, gstin, state_code, credit_terms_days } = req.body || {};
  const error = validate(req.body, {
    name, customer_type, state_code,
    credit_terms_days: credit_terms_days === '' || credit_terms_days === undefined ? null : credit_terms_days
  });
  if (error) return res.status(400).json({ error });
  const info = await db.run(
    'INSERT INTO customers (name, phone, location, customer_type, gstin, state_code, credit_terms_days) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [name, phone || null, location || null, customer_type, gstin || null, state_code || null,
      credit_terms_days === '' || credit_terms_days === undefined || credit_terms_days === null
        ? null : Number(credit_terms_days)]
  );
  res.status(201).json(withState(await db.get('SELECT * FROM customers WHERE id = $1', [info.lastId])));
}));

router.put('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });

  const b = req.body || {};
  const next = {
    name: b.name !== undefined ? b.name : existing.name,
    phone: b.phone !== undefined ? b.phone : existing.phone,
    location: b.location !== undefined ? b.location : existing.location,
    customer_type: b.customer_type !== undefined ? b.customer_type : existing.customer_type,
    gstin: b.gstin !== undefined ? b.gstin : existing.gstin,
    state_code: b.state_code !== undefined ? b.state_code : existing.state_code,
    credit_terms_days: b.credit_terms_days !== undefined ? b.credit_terms_days : existing.credit_terms_days
  };
  const error = validate(b, next);
  if (error) return res.status(400).json({ error });

  await db.run(
    'UPDATE customers SET name = $1, phone = $2, location = $3, customer_type = $4, gstin = $5, state_code = $6, credit_terms_days = $7 WHERE id = $8',
    [next.name, next.phone, next.location, next.customer_type, next.gstin, next.state_code,
      next.credit_terms_days === '' || next.credit_terms_days === null || next.credit_terms_days === undefined
        ? null : Number(next.credit_terms_days), existing.id]
  );
  res.json(withState(await db.get('SELECT * FROM customers WHERE id = $1', [existing.id])));
}));

router.delete('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  // ASSUMPTION-NEEDED: Deleting a customer who has orders would orphan those orders,
  // so the demo blocks it. The real build will decide between "block" or "soft archive".
  const count = (await db.get('SELECT COUNT(*) AS c FROM orders WHERE customer_id = $1', [req.params.id])).c;
  if (count > 0) {
    return res.status(400).json({ error: `Cannot delete: this customer has ${count} order(s). Delete or reassign the orders first.` });
  }
  await db.run('DELETE FROM invoices WHERE customer_id = $1', [req.params.id]);
  await db.run('DELETE FROM technical_visits WHERE customer_id = $1', [req.params.id]);
  await db.run('DELETE FROM customers WHERE id = $1', [req.params.id]);
  res.json({ deleted: true, id: Number(req.params.id) });
}));

module.exports = router;
