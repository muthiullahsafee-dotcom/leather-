const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const GRADES = ['Export Grade', 'Local Grade A', 'Local Grade B'];

const SELECT = `
  SELECT q.*, b.batch_code, p.code AS product_code, p.name AS product_name
  FROM quality_checks q
  LEFT JOIN batches b ON q.batch_id = b.id
  LEFT JOIN products p ON b.product_id = p.id
`;

router.get('/', wrap(async (req, res) => {
  const { grade, result } = req.query || {};
  if (grade || result) {
    const clauses = [];
    const params = [];
    if (grade) { clauses.push('q.grade = $' + (params.length + 1)); params.push(grade); }
    if (result) { clauses.push('q.pass_fail = $' + (params.length + 1)); params.push(result); }
    res.json(await db.all(SELECT + ' WHERE ' + clauses.join(' AND ') + ' ORDER BY q.id', params));
  } else {
    res.json(await db.all(SELECT + ' ORDER BY q.id'));
  }
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.get(SELECT + ' WHERE q.id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Quality check not found' });
  res.json(row);
}));

router.post('/', wrap(async (req, res) => {
  const { batch_id, grade, inspector_name, inspection_date, pass_fail, notes } = req.body || {};
  if (!batch_id || !grade || !inspector_name || !inspection_date) {
    return res.status(400).json({ error: 'batch_id, grade, inspector_name and inspection_date are required' });
  }
  const batch = await db.get('SELECT * FROM batches WHERE id = $1', [batch_id]);
  if (!batch) return res.status(400).json({ error: 'batch_id does not exist' });
  if (!GRADES.includes(grade)) return res.status(400).json({ error: `grade must be one of ${GRADES.join(', ')}` });
  const pass = pass_fail === undefined ? 'Pass' : pass_fail;
  if (pass !== 'Pass' && pass !== 'Fail') return res.status(400).json({ error: "pass_fail must be 'Pass' or 'Fail'" });

  const info = await db.run(`
    INSERT INTO quality_checks (batch_id, grade, inspector_name, inspection_date, pass_fail, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [batch_id, grade, inspector_name, inspection_date, pass, notes || null]);
  res.status(201).json(await db.get(SELECT + ' WHERE q.id = $1', [info.lastId]));
}));

router.delete('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM quality_checks WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Quality check not found' });
  await db.run('DELETE FROM quality_checks WHERE id = $1', [row.id]);
  res.json({ deleted: true, id: row.id });
}));

module.exports = router;