const express = require('express');
const db = require('../db');

const router = express.Router();

const VALID_TYPES = ['Wholesale', 'Retail', 'Export'];

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM customers ORDER BY name').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Customer not found' });
  res.json(row);
});

router.get('/:id/orders', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY order_date DESC').all(req.params.id);
  res.json({ customer, orders });
});

router.post('/', (req, res) => {
  const { name, phone, location, customer_type } = req.body || {};
  if (!name || !customer_type) {
    return res.status(400).json({ error: 'name and customer_type are required' });
  }
  if (!VALID_TYPES.includes(customer_type)) {
    return res.status(400).json({ error: `customer_type must be one of ${VALID_TYPES.join(', ')}` });
  }
  const info = db
    .prepare('INSERT INTO customers (name, phone, location, customer_type) VALUES (?, ?, ?, ?)')
    .run(name, phone || null, location || null, customer_type);
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
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
  db.prepare('UPDATE customers SET name = ?, phone = ?, location = ?, customer_type = ? WHERE id = ?')
    .run(next.name, next.phone, next.location, next.customer_type, existing.id);
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  // ASSUMPTION-NEEDED: Deleting a customer who has orders would orphan those orders,
  // so the demo blocks it. The real build will decide between "block" or "soft archive".
  const count = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE customer_id = ?').get(req.params.id).c;
  if (count > 0) {
    return res.status(400).json({ error: `Cannot delete: this customer has ${count} order(s). Delete or reassign the orders first.` });
  }
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.json({ deleted: true, id: Number(req.params.id) });
});

module.exports = router;