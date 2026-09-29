const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// A lot is one supplier delivery of a chemical: it has its own lot number, received
// date, expiry date and quantity, and sits in the admin office or the warehouse.
const STATUSES = ['Received', 'In Stock', 'Partly Issued', 'Expired'];
const WAREHOUSES = ['Warehouse', 'Admin Office'];

const detailSelect = `
  SELECT l.*, p.code AS product_code, p.name AS product_name, p.unit, p.hsn_code,
         o.order_no AS linked_order_no,
         COALESCE(c.name, '') AS linked_customer_name
  FROM lots l
  LEFT JOIN products p ON l.product_id = p.id
  LEFT JOIN orders o ON l.linked_order_id = o.id
  LEFT JOIN customers c ON o.customer_id = c.id
`;

async function detail(id) {
  return db.get(detailSelect + ' WHERE l.id = $1', [id]);
}

async function listRows(statusFilter) {
  if (statusFilter) {
    return db.all(detailSelect + ' WHERE l.status = $1 ORDER BY l.received_date DESC, l.id DESC', [statusFilter]);
  }
  return db.all(detailSelect + ' ORDER BY l.received_date DESC, l.id DESC');
}

router.get('/', wrap(async (req, res) => {
  res.json(await listRows(req.query.status));
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await detail(req.params.id);
  if (!row) return res.status(404).json({ error: 'Lot not found' });
  res.json(row);
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const required = ['lot_no', 'product_id', 'quantity', 'supplier', 'received_date'];
  for (const k of required) {
    if (b[k] === undefined || b[k] === null || b[k] === '') {
      return res.status(400).json({ error: `${k} is required` });
    }
  }
  if (!await db.get('SELECT id FROM products WHERE id = $1', [b.product_id])) {
    return res.status(400).json({ error: 'product_id does not exist' });
  }
  if (await db.get('SELECT id FROM lots WHERE lot_no = $1', [b.lot_no])) {
    return res.status(400).json({ error: 'A lot with this lot_no already exists' });
  }
  const status = b.status || 'In Stock';
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  }
  const info = await db.run(`
    INSERT INTO lots (lot_no, product_id, supplier, received_date, expiry_date, quantity, status, warehouse, linked_order_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
  `, [
    b.lot_no, b.product_id, b.supplier, b.received_date, b.expiry_date || null, b.quantity, status,
    b.warehouse || 'Warehouse', b.linked_order_id || null
  ]);
  res.status(201).json(await detail(info.lastId));
}));

// Move a lot one step along its life: Received -> In Stock -> Partly Issued -> Expired.
router.post('/:id/advance', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM lots WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Lot not found' });
  const idx = STATUSES.indexOf(row.status);
  if (idx < 0) return res.status(500).json({ error: 'Lot has an unknown status' });
  if (idx >= STATUSES.length - 1) {
    return res.status(400).json({ error: `Lot is already at the final status (${STATUSES[STATUSES.length - 1]})` });
  }
  const next = STATUSES[idx + 1];
  await db.run('UPDATE lots SET status = $1 WHERE id = $2', [next, row.id]);
  res.json(await detail(row.id));
}));

router.put('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM lots WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Lot not found' });
  const b = req.body || {};
  const next = {
    lot_no: b.lot_no !== undefined ? b.lot_no : row.lot_no,
    quantity: b.quantity !== undefined ? b.quantity : row.quantity,
    status: b.status !== undefined ? b.status : row.status,
    warehouse: b.warehouse !== undefined ? b.warehouse : row.warehouse,
    expiry_date: b.expiry_date !== undefined ? b.expiry_date : row.expiry_date
  };
  if (!STATUSES.includes(next.status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  }
  const dup = await db.get('SELECT id FROM lots WHERE lot_no = $1 AND id != $2', [next.lot_no, row.id]);
  if (dup) {
    return res.status(400).json({ error: `A lot with lot_no ${next.lot_no} already exists` });
  }
  await db.run('UPDATE lots SET lot_no = $1, quantity = $2, status = $3, warehouse = $4, expiry_date = $5 WHERE id = $6',
    [next.lot_no, next.quantity, next.status, next.warehouse, next.expiry_date, row.id]);
  res.json(await detail(row.id));
}));

router.delete('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM lots WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Lot not found' });
  await db.tx(async (x) => {
    const qc = await x.get('SELECT COUNT(*) AS c FROM quality_checks WHERE lot_id = $1', [row.id]);
    if (qc.c > 0) {
      await x.run('DELETE FROM quality_checks WHERE lot_id = $1', [row.id]);
    }
    await x.run('DELETE FROM lots WHERE id = $1', [row.id]);
  });
  res.json({ deleted: true, id: Number(row.id) });
}));

module.exports = router;
