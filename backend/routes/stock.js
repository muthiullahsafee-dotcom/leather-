const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Surya Tech holds chemical at two places: the admin office (small working stock) and
// the warehouse (bulk). A stock row is "this product, this much, at this place".
const WAREHOUSES = ['Warehouse', 'Admin Office'];

// Reorder level lives on the product master, so the low-stock flag is always
// compared against the level the buyer set for that chemical.
const SELECT = `
  SELECT s.*, p.code AS product_code, p.name AS product_name,
         p.hsn_code, p.unit AS product_unit, p.selling_price, p.reorder_level
  FROM stock_items s
  LEFT JOIN products p ON s.product_id = p.id
`;

function withFlags(row) {
  const quantity = Number(row.quantity || 0);
  const reorder = Number(row.reorder_level || 0);
  return { ...row, low_stock: quantity < reorder ? 1 : 0 };
}

async function listRows(onlyLow) {
  const rows = await db.all(SELECT + ' ORDER BY p.code, s.id');
  const flagged = rows.map(withFlags);
  return onlyLow ? flagged.filter((r) => r.low_stock === 1) : flagged;
}

router.get('/', wrap(async (req, res) => {
  res.json(await listRows(req.query.low === '1' || req.query.low === 'true'));
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.get(SELECT + ' WHERE s.id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Stock item not found' });
  res.json(withFlags(row));
}));

router.post('/', wrap(async (req, res) => {
  const { product_id, item_name, quantity, unit, warehouse } = req.body || {};
  if (!product_id || !item_name || quantity === undefined || quantity === null) {
    return res.status(400).json({ error: 'product_id, item_name and quantity are required' });
  }
  const product = await db.get('SELECT id FROM products WHERE id = $1', [product_id]);
  if (!product) return res.status(400).json({ error: 'product_id does not exist' });
  const info = await db.run(
    `INSERT INTO stock_items (product_id, item_name, quantity, unit, warehouse)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [product_id, item_name, quantity, unit || null, warehouse || 'Warehouse']
  );
  res.status(201).json(withFlags(await db.get(SELECT + ' WHERE s.id = $1', [info.lastId])));
}));

router.put('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM stock_items WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Stock item not found' });

  const b = req.body || {};
  const next = {
    product_id: b.product_id !== undefined ? b.product_id : existing.product_id,
    item_name: b.item_name !== undefined ? b.item_name : existing.item_name,
    quantity: b.quantity !== undefined ? b.quantity : existing.quantity,
    unit: b.unit !== undefined ? b.unit : existing.unit,
    warehouse: b.warehouse !== undefined ? b.warehouse : existing.warehouse
  };
  if (!next.product_id) return res.status(400).json({ error: 'product_id is required' });
  if (!await db.get('SELECT id FROM products WHERE id = $1', [next.product_id])) {
    return res.status(400).json({ error: 'product_id does not exist' });
  }
  await db.run(
    `UPDATE stock_items SET product_id = $1, item_name = $2, quantity = $3, unit = $4, warehouse = $5
     WHERE id = $6`,
    [next.product_id, next.item_name, next.quantity, next.unit, next.warehouse, existing.id]
  );
  res.json(withFlags(await db.get(SELECT + ' WHERE s.id = $1', [existing.id])));
}));

router.delete('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM stock_items WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Stock item not found' });
  await db.run('DELETE FROM stock_items WHERE id = $1', [row.id]);
  res.json({ deleted: true, id: Number(row.id) });
}));

module.exports = router;
