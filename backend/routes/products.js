const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', wrap(async (req, res) => {
  const rows = await db.all('SELECT * FROM products ORDER BY id');
  res.json(rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(row);
}));

router.post('/', wrap(async (req, res) => {
  const { code, name, price, sizes_available, sole_type } = req.body || {};
  if (!code || !name || price === undefined || price === null) {
    return res.status(400).json({ error: 'code, name and price are required' });
  }
  const existing = await db.get('SELECT id FROM products WHERE code = $1', [code]);
  if (existing) {
    return res.status(400).json({ error: `A product with code ${code} already exists` });
  }
  const info = await db.run(
    'INSERT INTO products (code, name, price, sizes_available, sole_type) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [code, name, price, sizes_available || null, sole_type || null]
  );
  const row = await db.get('SELECT * FROM products WHERE id = $1', [info.lastId]);
  res.status(201).json(row);
}));

router.put('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM products WHERE id = $1', [req.params.id]);
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
  const dup = await db.get('SELECT id FROM products WHERE code = $1 AND id != $2', [next.code, existing.id]);
  if (dup) return res.status(400).json({ error: `A product with code ${next.code} already exists` });

  await db.run(
    'UPDATE products SET code = $1, name = $2, price = $3, sizes_available = $4, sole_type = $5 WHERE id = $6',
    [next.code, next.name, next.price, next.sizes_available, next.sole_type, existing.id]
  );
  res.json(await db.get('SELECT * FROM products WHERE id = $1', [existing.id]));
}));

router.delete('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  // ASSUMPTION-NEEDED: deleting a product referenced by order items, batches or
  // finished stock would orphan those records, so the demo blocks it.
  const refs = await db.get(`
    SELECT
      (SELECT COUNT(*) FROM order_items WHERE product_id = $1) AS order_items,
      (SELECT COUNT(*) FROM batches WHERE product_id = $1) AS batches,
      (SELECT COUNT(*) FROM stock_items WHERE product_id = $1) AS stock_items
  `, [existing.id]);
  const total = refs.order_items + refs.batches + refs.stock_items;
  if (total > 0) {
    return res.status(400).json({ error: `Cannot delete: this product is referenced by ${refs.order_items} order item(s), ${refs.batches} batch(es) and ${refs.stock_items} stock item(s).` });
  }
  await db.run('DELETE FROM products WHERE id = $1', [existing.id]);
  res.json({ deleted: true, id: Number(existing.id) });
}));

module.exports = router;