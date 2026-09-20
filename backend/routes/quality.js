const express = require('express');
const db = require('../db');

const router = express.Router();

const GRADES = ['Export Grade', 'Local Grade A', 'Local Grade B'];

const findBatch = db.prepare('SELECT * FROM batches WHERE id = ?');

const SELECT = `
  SELECT q.*, b.batch_code, p.code AS product_code, p.name AS product_name
  FROM quality_checks q
  LEFT JOIN batches b ON q.batch_id = b.id
  LEFT JOIN products p ON b.product_id = p.id
`;

router.get('/', (req, res) => {
  const { grade, result } = req.query || {};
  let rows;
  if (grade || result) {
    const clauses = [];
    const params = [];
    if (grade) { clauses.push('q.grade = ?'); params.push(grade); }
    if (result) { clauses.push('q.pass_fail = ?'); params.push(result); }
    rows = db.prepare(SELECT + ' WHERE ' + clauses.join(' AND ') + ' ORDER BY q.id').all(...params);
  } else {
    rows = db.prepare(SELECT + ' ORDER BY q.id').all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare(SELECT + ' WHERE q.id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Quality check not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { batch_id, grade, inspector_name, inspection_date, pass_fail, notes } = req.body || {};
  if (!batch_id || !grade || !inspector_name || !inspection_date) {
    return res.status(400).json({ error: 'batch_id, grade, inspector_name and inspection_date are required' });
  }
  const batch = findBatch.get(batch_id);
  if (!batch) return res.status(400).json({ error: 'batch_id does not exist' });
  if (!GRADES.includes(grade)) return res.status(400).json({ error: `grade must be one of ${GRADES.join(', ')}` });
  const pass = pass_fail === undefined ? 'Pass' : pass_fail;
  if (pass !== 'Pass' && pass !== 'Fail') return res.status(400).json({ error: "pass_fail must be 'Pass' or 'Fail'" });

  const info = db.prepare(`
    INSERT INTO quality_checks (batch_id, grade, inspector_name, inspection_date, pass_fail, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(batch_id, grade, inspector_name, inspection_date, pass, notes || null);
  res.status(201).json(db.prepare(SELECT + ' WHERE q.id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM quality_checks WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Quality check not found' });
  db.prepare('DELETE FROM quality_checks WHERE id = ?').run(row.id);
  res.json({ deleted: true, id: row.id });
});

module.exports = router;