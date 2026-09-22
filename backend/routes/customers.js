const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_TYPES = ['Wholesale', 'Retail', 'Export'];

router.get('/', wrap(async (req, res) => {
  const rows = await db.all('SELECT * FROM customers ORDER BY name');
  res.json(rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Customer not found' });
  res.json(row);
}));

router.get('/:id/orders', wrap(async (req, res) => {
  const customer = await db.get('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const orders = await db.all('SELECT * FROM orders WHERE customer_id = $1 ORDER BY order_date DESC', [req.params.id]);
  res.json({ customer, orders });
}));

router.post('/', wrap(async (req, res) => {
  const { name, phone, location, customer_type } = req.body || {};
  if (!name || !customer_type) {
    return res.status(400).json({ error: 'name and customer_type are required' });
  }
  if (!VALID_TYPES.includes(customer_type)) {
    return res.status(400).json({ error: `customer_type must be one of ${VALID_TYPES.join(', ')}` });
  }
  const info = await db.run(
    'INSERT INTO customers (name, phone, location, customer_type) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, phone || null, location || null, customer_type]
  );
  res.status(201).json(await db.get('SELECT * FROM customers WHERE id = $1', [info.lastId]));
}));

router.put('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });

  const { name, phone, location, customer_type } = req.body || {};
  const next = {
    name: name !== undefined ? name : existing.name,
    phone: phone !== undefined ? phone : existing.phone,
    location: location !== undefined ? location : existing.location,
    customer_type: customer_type !== undefined ? customer_type : existing.customer_type
  };
  if (!next.name || !next.customer_type) return res.status(400).json({ error: 'name and customer_type are required' });
  if (!VALID_TYPES.includes(next.customer_type)) {
    return res.status(400).json({ error: `customer_type must be one of ${VALID_TYPES.join(', ')}` });
  }
  await db.run(
    'UPDATE customers SET name = $1, phone = $2, location = $3, customer_type = $4 WHERE id = $5',
    [next.name, next.phone, next.location, next.customer_type, existing.id]
  );
  res.json(await db.get('SELECT * FROM customers WHERE id = $1', [existing.id]));
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
  await db.run('DELETE FROM customers WHERE id = $1', [req.params.id]);
  res.json({ deleted: true, id: Number(req.params.id) });
}));

module.exports = router;