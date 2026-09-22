const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const STAGES = ['Cutting', 'Stitching', 'Finishing', 'Quality Check', 'Packed'];

const detailSelect = `
  SELECT b.*, p.code AS product_code, p.name AS product_name,
         o.id AS linked_order_id,
         COALESCE(c.name, '') AS linked_customer_name
  FROM batches b
  LEFT JOIN products p ON b.product_id = p.id
  LEFT JOIN orders o ON b.linked_order_id = o.id
  LEFT JOIN customers c ON o.customer_id = c.id
`;

async function detail(id) {
  return db.get(detailSelect + ' WHERE b.id = $1', [id]);
}

function stageIndex(s) {
  return STAGES.indexOf(s);
}

async function listRows(statusFilter) {
  if (statusFilter) {
    return db.all(detailSelect + ' WHERE b.stage = $1 ORDER BY b.id', [statusFilter]);
  }
  return db.all(detailSelect + ' ORDER BY b.id');
}

router.get('/', wrap(async (req, res) => {
  res.json(await listRows(req.query.stage));
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await detail(req.params.id);
  if (!row) return res.status(404).json({ error: 'Batch not found' });
  res.json(row);
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const required = ['batch_code', 'product_id', 'quantity'];
  for (const k of required) {
    if (b[k] === undefined || b[k] === null || b[k] === '') {
      return res.status(400).json({ error: `${k} is required` });
    }
  }
  const product = await db.get('SELECT * FROM products WHERE id = $1', [b.product_id]);
  if (!product) return res.status(400).json({ error: 'product_id does not exist' });
  if (await db.get('SELECT id FROM batches WHERE batch_code = $1', [b.batch_code])) {
    return res.status(400).json({ error: 'A batch with this batch_code already exists' });
  }
  const stage = b.stage || 'Cutting';
  if (!STAGES.includes(stage)) {
    return res.status(400).json({ error: `stage must be one of ${STAGES.join(', ')}` });
  }
  if (b.linked_order_id !== undefined && b.linked_order_id !== null && b.linked_order_id !== '' && !(await db.get('SELECT id FROM orders WHERE id = $1', [b.linked_order_id]))) {
    return res.status(400).json({ error: 'linked_order_id does not exist' });
  }
  const info = await db.run(`
    INSERT INTO batches (batch_code, product_id, quantity, start_date, expected_completion_date, stage, linked_order_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [b.batch_code, b.product_id, b.quantity, b.start_date || null, b.expected_completion_date || null, stage, b.linked_order_id || null]);
  res.status(201).json(await detail(info.lastId));
}));

router.post('/:id/advance', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM batches WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Batch not found' });
  const idx = stageIndex(row.stage);
  if (idx < 0) return res.status(500).json({ error: 'Batch has an unknown stage' });
  if (idx >= STAGES.length - 1) {
    return res.status(400).json({ error: 'Batch is already at the final stage (Packed)' });
  }
  const next = STAGES[idx + 1];
  await db.run('UPDATE batches SET stage = $1 WHERE id = $2', [next, row.id]);
  res.json(await detail(row.id));
}));

router.put('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM batches WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Batch not found' });
  const b = req.body || {};
  const next = {
    batch_code: b.batch_code !== undefined ? b.batch_code : row.batch_code,
    quantity: b.quantity !== undefined ? b.quantity : row.quantity,
    stage: b.stage !== undefined ? b.stage : row.stage
  };
  if (next.stage && !STAGES.includes(next.stage)) {
    return res.status(400).json({ error: `stage must be one of ${STAGES.join(', ')}` });
  }
  const dup = await db.get('SELECT id FROM batches WHERE batch_code = $1', [next.batch_code]);
  if (dup && dup.id !== row.id) {
    return res.status(400).json({ error: 'A batch with this batch_code already exists' });
  }
  await db.run('UPDATE batches SET batch_code = $1, quantity = $2, stage = $3 WHERE id = $4',
    [next.batch_code, next.quantity, row.stage, row.id]);
  res.json(await detail(row.id));
}));

router.delete('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM batches WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Batch not found' });
  await db.tx(async (x) => {
    const qc = await x.get('SELECT COUNT(*) AS c FROM quality_checks WHERE batch_id = $1', [row.id]);
    if (qc.c > 0) {
      await x.run('DELETE FROM quality_checks WHERE batch_id = $1', [row.id]);
    }
    await x.run('DELETE FROM batches WHERE id = $1', [row.id]);
  });
  res.json({ deleted: true, id: row.id });
}));

module.exports = router;