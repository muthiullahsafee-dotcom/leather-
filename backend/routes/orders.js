const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const STATUSES = ['Pending', 'In Production', 'Ready', 'Shipped', 'Delivered', 'Cancelled'];
const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'];
const ORDER_TYPES = ['Wholesale', 'Single Pair'];

// ASSUMPTION-NEEDED: Pricing is entered manually per order line (unit_price, unit_cost).
// There is no automatic wholesale discount off the product list price in this demo.
// ASSUMPTION-NEEDED: /:id/status accepts any valid status (not forward-only), so a
// status can move backwards or be cancelled at any point.

const orderSummarySelect = `
  SELECT o.*, c.name AS customer_name,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
  FROM orders o JOIN customers c ON o.customer_id = c.id
`;

async function getOrderDetail(id) {
  const order = await db.get(`SELECT o.*, c.name AS customer_name, c.location AS customer_location
    FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.id = $1`, [id]);
  if (!order) return null;
  order.items = await db.all(`
    SELECT oi.*, p.code AS product_code, p.name AS product_name
    FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1
    ORDER BY oi.id`, [id]);
  return order;
}

async function validateItemsInput(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'items must be a non-empty array' };
  }
  for (const it of items) {
    if (!it.product_id || !Number.isInteger(it.product_id)) return { error: 'each item needs a valid product_id' };
    const p = await db.get('SELECT id FROM products WHERE id = $1', [it.product_id]);
    if (!p) return { error: `product_id ${it.product_id} does not exist` };
    if (!it.size) return { error: 'each item needs a size' };
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) return { error: 'each item needs a positive integer quantity' };
    if (typeof it.unit_price !== 'number' || it.unit_price <= 0) return { error: 'each item needs a positive unit_price' };
    if (typeof it.unit_cost !== 'number' || it.unit_cost < 0) return { error: 'each item needs a unit_cost >= 0' };
  }
  return null;
}

function computeTotal(items) {
  return items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
}

async function insertItems(scope, orderId, items) {
  for (const it of items) {
    await scope.run(
      'INSERT INTO order_items (order_id, product_id, size, quantity, unit_price, unit_cost) VALUES ($1, $2, $3, $4, $5, $6)',
      [orderId, it.product_id, it.size, it.quantity, it.unit_price, it.unit_cost]
    );
  }
}

async function replaceItems(scope, orderId, items) {
  await scope.run('DELETE FROM order_items WHERE order_id = $1', [orderId]);
  await insertItems(scope, orderId, items);
}

async function createOrderWithItems(order) {
  return db.tx(async (x) => {
    const info = await x.run(`INSERT INTO orders
      (customer_id, order_type, order_date, status, payment_status, total_amount,
       is_export, export_country, shipment_date, shipping_method, tracking_ref)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        order.customer_id, order.order_type, order.order_date, order.status, order.payment_status, order.total_amount,
        order.is_export, order.export_country, order.shipment_date, order.shipping_method, order.tracking_ref
      ]
    );
    await insertItems(x, info.lastId, order.items);
    return info.lastId;
  });
}

router.get('/', wrap(async (req, res) => {
  const { status, order_type } = req.query;
  let sql = orderSummarySelect + ' WHERE 1=1';
  const params = [];
  if (status) {
    sql += ' AND o.status = $' + (params.length + 1);
    params.push(status);
  }
  if (order_type) {
    sql += ' AND o.order_type = $' + (params.length + 1);
    params.push(order_type);
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

  if (!ORDER_TYPES.includes(b.order_type)) return res.status(400).json({ error: `order_type must be one of ${ORDER_TYPES.join(', ')}` });
  const status = b.status || 'Pending';
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  const payment_status = b.payment_status || 'Unpaid';
  if (!PAYMENT_STATUSES.includes(payment_status)) return res.status(400).json({ error: `payment_status must be one of ${PAYMENT_STATUSES.join(', ')}` });

  const order = {
    customer_id: b.customer_id,
    order_type: b.order_type,
    order_date: b.order_date || new Date().toISOString().slice(0, 10),
    status,
    payment_status,
    total_amount: computeTotal(b.items),
    is_export: b.is_export ? 1 : 0,
    export_country: b.export_country || null,
    shipment_date: b.shipment_date || null,
    shipping_method: b.shipping_method || null,
    tracking_ref: b.tracking_ref || null,
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
    order_type: b.order_type !== undefined ? b.order_type : existing.order_type,
    order_date: b.order_date !== undefined ? b.order_date : existing.order_date,
    status: b.status !== undefined ? b.status : existing.status,
    payment_status: b.payment_status !== undefined ? b.payment_status : existing.payment_status,
    is_export: b.is_export !== undefined ? (b.is_export ? 1 : 0) : existing.is_export,
    export_country: b.export_country !== undefined ? b.export_country : existing.export_country,
    shipment_date: b.shipment_date !== undefined ? b.shipment_date : existing.shipment_date,
    shipping_method: b.shipping_method !== undefined ? b.shipping_method : existing.shipping_method,
    tracking_ref: b.tracking_ref !== undefined ? b.tracking_ref : existing.tracking_ref
  };

  const customer = await db.get('SELECT id FROM customers WHERE id = $1', [next.customer_id]);
  if (!customer) return res.status(400).json({ error: 'customer_id does not exist' });
  if (!ORDER_TYPES.includes(next.order_type)) return res.status(400).json({ error: `order_type must be one of ${ORDER_TYPES.join(', ')}` });
  if (!STATUSES.includes(next.status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  if (!PAYMENT_STATUSES.includes(next.payment_status)) return res.status(400).json({ error: `payment_status must be one of ${PAYMENT_STATUSES.join(', ')}` });

  const total_amount = b.items !== undefined ? computeTotal(b.items) : existing.total_amount;

  await db.tx(async (x) => {
    await x.run(`UPDATE orders SET customer_id = $1, order_type = $2, order_date = $3, status = $4, payment_status = $5,
      total_amount = $6, is_export = $7, export_country = $8, shipment_date = $9, shipping_method = $10, tracking_ref = $11
      WHERE id = $12`,
      [
        next.customer_id, next.order_type, next.order_date, next.status, next.payment_status,
        total_amount, next.is_export, next.export_country, next.shipment_date, next.shipping_method, next.tracking_ref,
        existing.id
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
    await x.run('DELETE FROM order_items WHERE order_id = $1', [existing.id]);
    await x.run('DELETE FROM quality_checks WHERE batch_id IN (SELECT id FROM batches WHERE linked_order_id = $1)', [existing.id]);
    // ASSUMPTION-NEEDED: deleting an order keeps its batches but unsets the order link,
    // and removes quality checks belonging to those batches (they have no meaning without the batch).
    await x.run('UPDATE batches SET linked_order_id = NULL WHERE linked_order_id = $1', [existing.id]);
    await x.run('DELETE FROM orders WHERE id = $1', [existing.id]);
  });
  res.json({ deleted: true, id: Number(existing.id) });
}));

module.exports = router;