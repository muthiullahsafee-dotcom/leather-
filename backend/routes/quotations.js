const express = require('express');
const db = require('../db');
const { today: todayISO, thisMonth, addDays, daysBetween } = require('../dates');
const { round2 } = require('../gst');
const { nextDocNo } = require('../numbers');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected'];

const LIST_SELECT = `
  SELECT q.*, c.name AS customer_name, c.location AS customer_location,
    (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = q.id) AS item_count,
    o.order_no AS converted_order_no
  FROM quotations q
  JOIN customers c ON q.customer_id = c.id
  LEFT JOIN orders o ON q.converted_order_id = o.id
`;

async function getDetail(id) {
  const q = await db.get(LIST_SELECT + ' WHERE q.id = $1', [id]);
  if (!q) return null;
  q.items = await db.all(`
    SELECT qi.*, p.code AS product_code, p.name AS product_name, p.unit, p.hsn_code
    FROM quotation_items qi JOIN products p ON qi.product_id = p.id
    WHERE qi.quotation_id = $1 ORDER BY qi.id`, [id]);
  return q;
}

function computeTotal(items) {
  return round2(items.reduce((s, it) => s + Number(it.unit_price) * Number(it.quantity), 0));
}

async function validateItemsInput(items) {
  if (!Array.isArray(items) || items.length === 0) return { error: 'items must be a non-empty array' };
  for (const it of items) {
    if (!it.product_id || !Number.isInteger(Number(it.product_id))) return { error: 'each item needs a valid product_id' };
    if (!await db.get('SELECT id FROM products WHERE id = $1', [it.product_id])) return { error: `product_id ${it.product_id} does not exist` };
    if (!Number.isFinite(Number(it.quantity)) || Number(it.quantity) <= 0) return { error: 'each item needs a positive quantity' };
    if (!(Number(it.unit_price) > 0)) return { error: 'each item needs a positive unit_price' };
    if (!Number.isFinite(Number(it.unit_cost)) || Number(it.unit_cost) < 0) return { error: 'each item needs a unit_cost >= 0' };
  }
  return null;
}

async function insertItems(scope, quotationId, items) {
  for (const it of items) {
    await scope.run(
      'INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, unit_cost) VALUES ($1, $2, $3, $4, $5)',
      [quotationId, it.product_id, it.quantity, it.unit_price, it.unit_cost]
    );
  }
}

router.get('/', wrap(async (req, res) => {
  const { status } = req.query;
  if (status) {
    return res.json(await db.all(LIST_SELECT + ' WHERE q.status = $1 ORDER BY q.quote_date DESC, q.id DESC', [status]));
  }
  res.json(await db.all(LIST_SELECT + ' ORDER BY q.quote_date DESC, q.id DESC'));
}));

router.get('/:id', wrap(async (req, res) => {
  const q = await getDetail(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quotation not found' });
  res.json(q);
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const itemError = await validateItemsInput(b.items);
  if (itemError) return res.status(400).json({ error: itemError.error });
  if (!b.customer_id) return res.status(400).json({ error: 'customer_id is required' });
  if (!await db.get('SELECT id FROM customers WHERE id = $1', [b.customer_id])) {
    return res.status(400).json({ error: 'customer_id does not exist' });
  }
  const status = b.status || 'Draft';
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });

  const id = await db.tx(async (x) => {
    const quotation_no = await nextDocNo(x, 'QTN', 'quotations', 'quotation_no');
    const info = await x.run(`INSERT INTO quotations
      (quotation_no, customer_id, quote_date, valid_until, status, total_amount, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        quotation_no, b.customer_id, b.quote_date || todayISO(),
        b.valid_until || null, status, computeTotal(b.items), b.notes || null
      ]
    );
    await insertItems(x, info.lastId, b.items);
    return info.lastId;
  });
  res.status(201).json(await getDetail(id));
}));

router.put('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Quotation not found' });

  const b = req.body || {};
  if (b.items !== undefined) {
    const itemError = await validateItemsInput(b.items);
    if (itemError) return res.status(400).json({ error: itemError.error });
  }
  const next = {
    customer_id: b.customer_id !== undefined ? b.customer_id : existing.customer_id,
    quote_date: b.quote_date !== undefined ? b.quote_date : existing.quote_date,
    valid_until: b.valid_until !== undefined ? b.valid_until : existing.valid_until,
    status: b.status !== undefined ? b.status : existing.status,
    notes: b.notes !== undefined ? b.notes : existing.notes
  };
  if (!await db.get('SELECT id FROM customers WHERE id = $1', [next.customer_id])) {
    return res.status(400).json({ error: 'customer_id does not exist' });
  }
  if (!STATUSES.includes(next.status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });

  const total_amount = b.items !== undefined ? computeTotal(b.items) : existing.total_amount;

  await db.tx(async (x) => {
    await x.run(`UPDATE quotations SET customer_id = $1, quote_date = $2, valid_until = $3,
      status = $4, total_amount = $5, notes = $6 WHERE id = $7`,
      [next.customer_id, next.quote_date, next.valid_until, next.status, total_amount, next.notes, existing.id]);
    if (b.items !== undefined) {
      await x.run('DELETE FROM quotation_items WHERE quotation_id = $1', [existing.id]);
      await insertItems(x, existing.id, b.items);
    }
  });
  res.json(await getDetail(existing.id));
}));

router.patch('/:id/status', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Quotation not found' });
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  await db.run('UPDATE quotations SET status = $1 WHERE id = $2', [status, existing.id]);
  res.json(await getDetail(existing.id));
}));

// A quotation becomes a sales order: same customer, same lines, copied at today's date.
// Only an Accepted or Sent quotation can be converted, so a draft never slips into
// dispatch by accident. The quotation is marked Accepted so the demo cannot convert
// the same quotation twice.
router.post('/:id/convert', wrap(async (req, res) => {
  const q = await getDetail(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quotation not found' });
  if (q.status !== 'Accepted' && q.status !== 'Sent') {
    return res.status(400).json({ error: `Only an Accepted or Sent quotation can be converted (this one is ${q.status})` });
  }
  if (q.converted_order_id) {
    return res.status(400).json({ error: `This quotation was already converted to order ${q.converted_order_no}` });
  }

  const order = await db.tx(async (x) => {
    const order_no = await nextDocNo(x, 'SO', 'orders', 'order_no');
    const info = await x.run(`INSERT INTO orders
      (order_no, customer_id, supply_type, order_date, status, payment_status, total_amount, delivery_date, vehicle_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        order_no, q.customer_id, req.body && req.body.supply_type ? req.body.supply_type : 'Bulk',
        todayISO(), 'Pending Approval', 'Unpaid',
        q.total_amount, null, null
      ]
    );
    for (const it of q.items) {
      await x.run(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost) VALUES ($1, $2, $3, $4, $5)',
        [info.lastId, it.product_id, it.quantity, it.unit_price, it.unit_cost]
      );
    }
    await x.run(`UPDATE quotations SET status = 'Accepted', converted_order_id = $1 WHERE id = $2`, [info.lastId, q.id]);
    return { id: info.lastId, order_no };
  });

  res.status(201).json({
    message: `Quotation ${q.quotation_no} converted to order ${order.order_no}`,
    order_id: order.id,
    order_no: order.order_no
  });
}));

router.delete('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Quotation not found' });
  if (existing.converted_order_id) {
    return res.status(400).json({ error: 'Cannot delete: this quotation has already been converted to an order.' });
  }
  await db.tx(async (x) => {
    await x.run('DELETE FROM quotation_items WHERE quotation_id = $1', [existing.id]);
    await x.run('DELETE FROM quotations WHERE id = $1', [existing.id]);
  });
  res.json({ deleted: true, id: Number(existing.id) });
}));

module.exports = router;
