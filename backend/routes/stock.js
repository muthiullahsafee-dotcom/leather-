const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function withLowFlag(row) {
  return { ...row, low_stock: row.quantity < row.reorder_threshold ? 1 : 0 };
}

async function listRows(onlyLow) {
  const rows = await db.all(`
    SELECT s.*, p.code AS product_code, p.name AS product_name
    FROM stock_items s LEFT JOIN products p ON s.product_id = p.id
    ORDER BY s.item_type, s.id
  `);
  const flagged = rows.map(withLowFlag);
  return onlyLow ? flagged.filter((r) => r.low_stock === 1) : flagged;
}

router.get('/', wrap(async (req, res) => {
  res.json(await listRows(req.query.low === '1' || req.query.low === 'true'));
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM stock_items WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Stock item not found' });
  res.json(withLowFlag(row));
}));

router.post('/', wrap(async (req, res) => {
  const { item_name, item_type, product_id, size, quantity, unit, reorder_threshold } = req.body || {};
  if (!item_name || !item_type || quantity === undefined || quantity === null) {
    return res.status(400).json({ error: 'item_name, item_type and quantity are required' });
  }
  if (item_type === 'Finished Stock' && !product_id) {
    return res.status(400).json({ error: 'Finished Stock requires a product_id' });
  }
  if (item_type === 'Raw Material' && product_id) {
    return res.status(400).json({ error: 'Raw Material should not have a product_id' });
  }
  const info = await db.run(
    `INSERT INTO stock_items (item_name, item_type, product_id, size, quantity, unit, reorder_threshold)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [item_name, item_type, product_id || null, size || null, quantity, unit || null, reorder_threshold !== undefined ? reorder_threshold : 0]
  );
  const row = await db.get('SELECT * FROM stock_items WHERE id = $1', [info.lastId]);
  res.status(201).json(withLowFlag(row));
}));

router.put('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM stock_items WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Stock item not found' });

  const { item_name, item_type, product_id, size, quantity, unit, reorder_threshold } = req.body || {};
  const next = {
    item_name: item_name !== undefined ? item_name : existing.item_name,
    item_type: item_type !== undefined ? item_type : existing.item_type,
    product_id: product_id !== undefined ? (product_id || null) : existing.product_id,
    size: size !== undefined ? size : existing.size,
    quantity: quantity !== undefined ? quantity : existing.quantity,
    unit: unit !== undefined ? unit : existing.unit,
    reorder_threshold: reorder_threshold !== undefined ? reorder_threshold : existing.reorder_threshold
  };
  if (next.item_type === 'Finished Stock' && !next.product_id) {
    return res.status(400).json({ error: 'Finished Stock requires a product_id' });
  }
  if (next.item_type === 'Raw Material' && next.product_id) {
    return res.status(400).json({ error: 'Raw Material should not have a product_id' });
  }
  await db.run(
    `UPDATE stock_items SET item_name = $1, item_type = $2, product_id = $3, size = $4, quantity = $5, unit = $6, reorder_threshold = $7
     WHERE id = $8`,
    [next.item_name, next.item_type, next.product_id, next.size, next.quantity, next.unit, next.reorder_threshold, existing.id]
  );
  const row = await db.get('SELECT * FROM stock_items WHERE id = $1', [existing.id]);
  res.json(withLowFlag(row));
}));

router.delete('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM stock_items WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Stock item not found' });
  await db.run('DELETE FROM stock_items WHERE id = $1', [row.id]);
  res.json({ deleted: true, id: row.id });
}));

module.exports = router;