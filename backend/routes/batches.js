const express = require('express');
const db = require('../db');

const router = express.Router();

const STAGES = ['Cutting', 'Stitching', 'Finishing', 'Quality Check', 'Packed'];

const findByCode = db.prepare('SELECT * FROM products WHERE code = ?');
const findProduct = db.prepare('SELECT * FROM products WHERE id = ?');
const findOrder = db.prepare('SELECT id FROM orders WHERE id = ?');
const findBatchByCode = db.prepare('SELECT id FROM batches WHERE batch_code = ?');
const rowById = db.prepare('SELECT * FROM batches WHERE id = ?');

const detailSelect = `
  SELECT b.*, p.code AS product_code, p.name AS product_name,
         o.id AS linked_order_id,
         COALESCE(c.name, '') AS linked_customer_name
  FROM batches b
  LEFT JOIN products p ON b.product_id = p.id
  LEFT JOIN orders o ON b.linked_order_id = o.id
  LEFT JOIN customers c ON o.customer_id = c.id
`;

function detail(id) {
  return db.prepare(detailSelect + ' WHERE b.id = ?').get(id);
}

function stageIndex(s) {
  return STAGES.indexOf(s);
}

function listRows(statusFilter) {
  if (statusFilter) {
    return db.prepare(detailSelect + ' WHERE b.stage = ? ORDER BY b.id').all(statusFilter);
  }
  return db.prepare(detailSelect + ' ORDER BY b.id').all();
}

router.get('/', (req, res) => {
  res.json(listRows(req.query.stage));
});

router.get('/:id', (req, res) => {
  const row = detail(req.params.id);
  if (!row) return res.status(404).json({ error: 'Batch not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const required = ['batch_code', 'product_id', 'quantity'];
  for (const k of required) {
    if (b[k] === undefined || b[k] === null || b[k] === '') {
      return res.status(400).json({ error: `${k} is required` });
    }
  }
  const product = findProduct.get(b.product_id);
  if (!product) return res.status(400).json({ error: 'product_id does not exist' });
  if (findBatchByCode.get(b.batch_code)) {
    return res.status(400).json({ error: 'A batch with this batch_code already exists' });
  }
  const stage = b.stage || 'Cutting';
  if (!STAGES.includes(stage)) {
    return res.status(400).json({ error: `stage must be one of ${STAGES.join(', ')}` });
  }
  if (b.linked_order_id !== undefined && b.linked_order_id !== null && b.linked_order_id !== '' && !findOrder.get(b.linked_order_id)) {
    return res.status(400).json({ error: 'linked_order_id does not exist' });
  }
  const info = db.prepare(`
    INSERT INTO batches (batch_code, product_id, quantity, start_date, expected_completion_date, stage, linked_order_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(b.batch_code, b.product_id, b.quantity, b.start_date || null, b.expected_completion_date || null, stage, b.linked_order_id || null);
  res.status(201).json(detail(info.lastInsertRowid));
});

router.post('/:id/advance', (req, res) => {
  const row = rowById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Batch not found' });
  const idx = stageIndex(row.stage);
  if (idx < 0) return res.status(500).json({ error: 'Batch has an unknown stage' });
  if (idx >= STAGES.length - 1) {
    return res.status(400).json({ error: 'Batch is already at the final stage (Packed)' });
  }
  const next = STAGES[idx + 1];
  db.prepare('UPDATE batches SET stage = ? WHERE id = ?').run(next, row.id);
  res.json(detail(row.id));
});

router.put('/:id', (req, res) => {
  const row = rowById.get(req.params.id);
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
  if (findBatchByCode.get(next.batch_code) && findBatchByCode.get(next.batch_code).id !== row.id) {
    return res.status(400).json({ error: 'A batch with this batch_code already exists' });
  }
  db.prepare('UPDATE batches SET batch_code = ?, quantity = ?, stage = ? WHERE id = ?')
    .run(next.batch_code, next.quantity, row.stage, row.id);
  res.json(detail(row.id));
});

router.delete('/:id', (req, res) => {
  const row = rowById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Batch not found' });
  const qc = db.prepare('SELECT COUNT(*) AS c FROM quality_checks WHERE batch_id = ?').get(row.id).c;
  if (qc > 0) {
    db.prepare('DELETE FROM quality_checks WHERE batch_id = ?').run(row.id);
  }
  db.prepare('DELETE FROM batches WHERE id = ?').run(row.id);
  res.json({ deleted: true, id: row.id });
});

module.exports = router;
