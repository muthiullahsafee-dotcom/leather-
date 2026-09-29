const express = require('express');
const db = require('../db');
const { today: todayISO, thisMonth, addDays, daysBetween } = require('../dates');
const { round2 } = require('../gst');
const { nextDocNo } = require('../numbers');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const STATUSES = ['Pending Approval', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'];
const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'];
const SUPPLY_TYPES = ['Bulk', 'Retail'];

// ASSUMPTION-NEEDED: Pricing is entered manually per order line (unit_price, unit_cost).
// There is no automatic quantity discount off the product list price in this demo.
// ASSUMPTION-NEEDED: /:id/status accepts any valid status (not forward-only), so a
// status can move backwards or be cancelled at any point.

const orderSummarySelect = `
  SELECT o.*, c.name AS customer_name, c.location AS customer_location,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
    (SELECT i.invoice_no FROM invoices i WHERE i.order_id = o.id LIMIT 1) AS invoice_no
  FROM orders o JOIN customers c ON o.customer_id = c.id
`;

async function getOrderDetail(id) {
  const order = await db.get(`${orderSummarySelect} WHERE o.id = $1`, [id]);
  if (!order) return null;
  order.items = await db.all(`
    SELECT oi.*, p.code AS product_code, p.name AS product_name, p.unit, p.hsn_code
    FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1
    ORDER BY oi.id`, [id]);
  return order;
}

async function validateItemsInput(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'items must be a non-empty array' };
  }
  for (const it of items) {
    if (!it.product_id || !Number.isInteger(Number(it.product_id))) return { error: 'each item needs a valid product_id' };
    const p = await db.get('SELECT id FROM products WHERE id = $1', [it.product_id]);
    if (!p) return { error: `product_id ${it.product_id} does not exist` };
    if (!Number.isFinite(Number(it.quantity)) || Number(it.quantity) <= 0) return { error: 'each item needs a positive quantity' };
    if (typeof Number(it.unit_price) !== 'number' || Number(it.unit_price) <= 0) return { error: 'each item needs a positive unit_price' };
    if (!Number.isFinite(Number(it.unit_cost)) || Number(it.unit_cost) < 0) return { error: 'each item needs a unit_cost >= 0' };
  }
  return null;
}

function computeTotal(items) {
  return round2(items.reduce((s, it) => s + Number(it.unit_price) * Number(it.quantity), 0));
}

async function insertItems(scope, orderId, items) {
  for (const it of items) {
    await scope.run(
      'INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost) VALUES ($1, $2, $3, $4, $5)',
      [orderId, it.product_id, it.quantity, it.unit_price, it.unit_cost]
    );
  }
}

async function replaceItems(scope, orderId, items) {
  await scope.run('DELETE FROM order_items WHERE order_id = $1', [orderId]);
  await insertItems(scope, orderId, items);
}

async function createOrderWithItems(order) {
  return db.tx(async (x) => {
    const order_no = order.order_no || await nextDocNo(x, 'SO', 'orders', 'order_no');
    const info = await x.run(`INSERT INTO orders
      (order_no, customer_id, supply_type, order_date, status, payment_status, total_amount, delivery_date, vehicle_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        order_no, order.customer_id, order.supply_type, order.order_date, order.status, order.payment_status, order.total_amount,
        order.delivery_date, order.vehicle_number
      ]
    );
    await insertItems(x, info.lastId, order.items);
    return info.lastId;
  });
}

router.get('/', wrap(async (req, res) => {
  const { status, supply_type } = req.query;
  let sql = orderSummarySelect + ' WHERE 1=1';
  const params = [];
  if (status) {
    sql += ' AND o.status = $' + (params.length + 1);
    params.push(status);
  }
  if (supply_type) {
    sql += ' AND o.supply_type = $' + (params.length + 1);
    params.push(supply_type);
  }
  sql += ' ORDER BY o.order_date DESC, o.id DESC';
  res.json(await db.all(sql, params));
}));

router.get('/:id', wrap(async (req, res) => {
  const order = await getOrderDetail(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const itemError = await validateItemsInput(b.items);
  if (itemError) return res.status(400).json({ error: itemError.error });

  if (!b.customer_id) return res.status(400).json({ error: 'customer_id is required' });
  const customer = await db.get('SELECT id FROM customers WHERE id = $1', [b.customer_id]);
  if (!customer) return res.status(400).json({ error: 'customer_id does not exist' });

  if (!SUPPLY_TYPES.includes(b.supply_type)) return res.status(400).json({ error: `supply_type must be one of ${SUPPLY_TYPES.join(', ')}` });
  const status = b.status || 'Pending Approval';
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  const payment_status = b.payment_status || 'Unpaid';
  if (!PAYMENT_STATUSES.includes(payment_status)) return res.status(400).json({ error: `payment_status must be one of ${PAYMENT_STATUSES.join(', ')}` });

  const order = {
    customer_id: b.customer_id,
    supply_type: b.supply_type,
    order_date: b.order_date || todayISO(),
    status,
    payment_status,
    total_amount: computeTotal(b.items),
    delivery_date: b.delivery_date || null,
    vehicle_number: b.vehicle_number || null,
    items: b.items
  };
  const id = await createOrderWithItems(order);
  res.status(201).json(await getOrderDetail(id));
}));

router.put('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  const b = req.body || {};
  if (b.items !== undefined) {
    const itemError = await validateItemsInput(b.items);
    if (itemError) return res.status(400).json({ error: itemError.error });
  }

  const next = {
    customer_id: b.customer_id !== undefined ? b.customer_id : existing.customer_id,
    supply_type: b.supply_type !== undefined ? b.supply_type : existing.supply_type,
    order_date: b.order_date !== undefined ? b.order_date : existing.order_date,
    status: b.status !== undefined ? b.status : existing.status,
    payment_status: b.payment_status !== undefined ? b.payment_status : existing.payment_status,
    delivery_date: b.delivery_date !== undefined ? b.delivery_date : existing.delivery_date,
    vehicle_number: b.vehicle_number !== undefined ? b.vehicle_number : existing.vehicle_number
  };

  const customer = await db.get('SELECT id FROM customers WHERE id = $1', [next.customer_id]);
  if (!customer) return res.status(400).json({ error: 'customer_id does not exist' });
  if (!SUPPLY_TYPES.includes(next.supply_type)) return res.status(400).json({ error: `supply_type must be one of ${SUPPLY_TYPES.join(', ')}` });
  if (!STATUSES.includes(next.status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  if (!PAYMENT_STATUSES.includes(next.payment_status)) return res.status(400).json({ error: `payment_status must be one of ${PAYMENT_STATUSES.join(', ')}` });

  const total_amount = b.items !== undefined ? computeTotal(b.items) : existing.total_amount;

  await db.tx(async (x) => {
    await x.run(`UPDATE orders SET customer_id = $1, supply_type = $2, order_date = $3, status = $4, payment_status = $5,
      total_amount = $6, delivery_date = $7, vehicle_number = $8
      WHERE id = $9`,
      [
        next.customer_id, next.supply_type, next.order_date, next.status, next.payment_status,
        total_amount, next.delivery_date, next.vehicle_number, existing.id
      ]
    );
    if (b.items !== undefined) await replaceItems(x, existing.id, b.items);
  });

  res.json(await getOrderDetail(existing.id));
}));

router.patch('/:id/status', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  await db.run('UPDATE orders SET status = $1 WHERE id = $2', [status, existing.id]);
  res.json(await getOrderDetail(existing.id));
}));

router.patch('/:id/payment', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  const { payment_status } = req.body || {};
  if (!PAYMENT_STATUSES.includes(payment_status)) return res.status(400).json({ error: `payment_status must be one of ${PAYMENT_STATUSES.join(', ')}` });
  await db.run('UPDATE orders SET payment_status = $1 WHERE id = $2', [payment_status, existing.id]);
  res.json(await getOrderDetail(existing.id));
}));

router.delete('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  await db.tx(async (x) => {
    // An order that has been invoiced is financial history: keep the invoice and its
    // receivable, just unlink it, rather than deleting the tax document.
    const invoices = await x.all('SELECT id FROM invoices WHERE order_id = $1', [existing.id]);
    for (const inv of invoices) {
      await x.run('UPDATE invoices SET order_id = NULL WHERE id = $1', [inv.id]);
    }
    await x.run('DELETE FROM order_items WHERE order_id = $1', [existing.id]);
    await x.run('DELETE FROM quality_checks WHERE lot_id IN (SELECT id FROM lots WHERE linked_order_id = $1)', [existing.id]);
    // ASSUMPTION-NEEDED: deleting an order keeps its lots but unsets the order link,
    // and removes quality checks belonging to those lots (they have no meaning without the lot).
    await x.run('UPDATE lots SET linked_order_id = NULL WHERE linked_order_id = $1', [existing.id]);
    await x.run('DELETE FROM orders WHERE id = $1', [existing.id]);
  });
  res.json({ deleted: true, id: Number(existing.id) });
}));

module.exports = router;
