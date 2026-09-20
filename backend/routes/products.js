const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY id').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { code, name, price, sizes_available, sole_type } = req.body || {};
  if (!code || !name || price === undefined || price === null) {
    return res.status(400).json({ error: 'code, name and price are required' });
  }
  const existing = db.prepare('SELECT id FROM products WHERE code = ?').get(code);
  if (existing) {
    return res.status(400).json({ error: `A product with code ${code} already exists` });
  }
  const info = db
    .prepare('INSERT INTO products (code, name, price, sizes_available, sole_type) VALUES (?, ?, ?, ?, ?)')
    .run(code, name, price, sizes_available || null, sole_type || null);
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const { code, name, price, sizes_available, sole_type } = req.body || {};
  const next = {
    code: code !== undefined ? code : existing.code,
    name: name !== undefined ? name : existing.name,
    price: price !== undefined ? price : existing.price,
    sizes_available: sizes_available !== undefined ? sizes_available : existing.sizes_available,
    sole_type: sole_type !== undefined ? sole_type : existing.sole_type
  };
  if (!next.code || !next.name || next.price === null || next.price === undefined) {
    return res.status(400).json({ error: 'code, name and price are required' });
  }
  const dup = db.prepare('SELECT id FROM products WHERE code = ? AND id != ?').get(next.code, existing.id);
  if (dup) return res.status(400).json({ error: `A product with code ${next.code} already exists` });

  db.prepare('UPDATE products SET code = ?, name = ?, price = ?, sizes_available = ?, sole_type = ? WHERE id = ?')
    .run(next.code, next.name, next.price, next.sizes_available, next.sole_type, existing.id);
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  // ASSUMPTION-NEEDED: deleting a product referenced by order items, batches or
  // finished stock would orphan those records, so the demo blocks it.
  const refs = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM order_items WHERE product_id = ?) AS order_items,
      (SELECT COUNT(*) FROM batches WHERE product_id = ?) AS batches,
      (SELECT COUNT(*) FROM stock_items WHERE product_id = ?) AS stock_items
  `).get(existing.id, existing.id, existing.id);
  const total = refs.order_items + refs.batches + refs.stock_items;
  if (total > 0) {
    return res.status(400).json({ error: `Cannot delete: this product is referenced by ${refs.order_items} order item(s), ${refs.batches} batch(es) and ${refs.stock_items} stock item(s).` });
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(existing.id);
  res.json({ deleted: true, id: Number(existing.id) });
});

module.exports = router;