const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// A leather chemical master row: code, name, HSN, packing unit, brand, purchase and
// selling price, GST rate and the reorder level the Stock screen flags against.
const FIELDS = ['code', 'name', 'hsn_code', 'unit', 'brand', 'purchase_price', 'selling_price', 'gst_rate', 'reorder_level'];

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
  const b = req.body || {};
  if (!b.code || !b.name || b.selling_price === undefined || b.selling_price === null) {
    return res.status(400).json({ error: 'code, name and selling_price are required' });
  }
  const existing = await db.get('SELECT id FROM products WHERE code = $1', [b.code]);
  if (existing) {
    return res.status(400).json({ error: `A product with code ${b.code} already exists` });
  }
  const info = await db.run(`
    INSERT INTO products (code, name, hsn_code, unit, brand, purchase_price, selling_price, gst_rate, reorder_level)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [b.code, b.name, b.hsn_code || null, b.unit || null, b.brand || null,
      b.purchase_price || null, b.selling_price, b.gst_rate || null, b.reorder_level || 0]
  );
  res.status(201).json(await db.get('SELECT * FROM products WHERE id = $1', [info.lastId]));
}));

router.put('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const b = req.body || {};
  const next = {};
  for (const f of FIELDS) next[f] = b[f] !== undefined ? b[f] : existing[f];

  if (!next.code || !next.name || next.selling_price === null || next.selling_price === undefined) {
    return res.status(400).json({ error: 'code, name and selling_price are required' });
  }
  const dup = await db.get('SELECT id FROM products WHERE code = $1 AND id != $2', [next.code, existing.id]);
  if (dup) return res.status(400).json({ error: `A product with code ${next.code} already exists` });

  await db.run(`
    UPDATE products SET code = $1, name = $2, hsn_code = $3, unit = $4, brand = $5,
      purchase_price = $6, selling_price = $7, gst_rate = $8, reorder_level = $9
    WHERE id = $10`,
    [next.code, next.name, next.hsn_code, next.unit, next.brand,
      next.purchase_price, next.selling_price, next.gst_rate, next.reorder_level, existing.id]
  );
  res.json(await db.get('SELECT * FROM products WHERE id = $1', [existing.id]));
}));

router.delete('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  // ASSUMPTION-NEEDED: deleting a product referenced by order items, invoices, lots or
  // stock would orphan those records, so the demo blocks it.
  const refs = await db.get(`
    SELECT
      (SELECT COUNT(*) FROM order_items WHERE product_id = $1) AS order_items,
      (SELECT COUNT(*) FROM quotation_items WHERE product_id = $1) AS quotation_items,
      (SELECT COUNT(*) FROM invoice_items WHERE product_id = $1) AS invoice_items,
      (SELECT COUNT(*) FROM lots WHERE product_id = $1) AS lots,
      (SELECT COUNT(*) FROM stock_items WHERE product_id = $1) AS stock_items
  `, [existing.id]);
  const total = refs.order_items + refs.quotation_items + refs.invoice_items + refs.lots + refs.stock_items;
  if (total > 0) {
    return res.status(400).json({ error: `Cannot delete: this product is referenced by ${refs.order_items} order item(s), ${refs.quotation_items} quotation item(s), ${refs.invoice_items} invoice item(s), ${refs.lots} lot(s) and ${refs.stock_items} stock item(s).` });
  }
  await db.run('DELETE FROM products WHERE id = $1', [existing.id]);
  res.json({ deleted: true, id: Number(existing.id) });
}));

module.exports = router;
