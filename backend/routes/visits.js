const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Surya Tech's technical consultants go to the tannery floor, diagnose a process
// problem and agree a follow-up. A visit stays Open until the follow-up is done.
const STATUSES = ['Open', 'Follow-up Due', 'Resolved'];

const SELECT = `
  SELECT v.*, c.name AS customer_name, c.location AS customer_location
  FROM technical_visits v JOIN customers c ON v.customer_id = c.id
`;

router.get('/', wrap(async (req, res) => {
  const { status } = req.query;
  if (status) return res.json(await db.all(SELECT + ' WHERE v.status = $1 ORDER BY v.visit_date DESC, v.id DESC', [status]));
  res.json(await db.all(SELECT + ' ORDER BY v.visit_date DESC, v.id DESC'));
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.get(SELECT + ' WHERE v.id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Visit not found' });
  res.json(row);
}));

router.post('/', wrap(async (req, res) => {
  const { customer_id, visit_date, engineer, issue, solution_given, follow_up_date, status } = req.body || {};
  if (!customer_id || !visit_date || !engineer || !issue) {
    return res.status(400).json({ error: 'customer_id, visit_date, engineer and issue are required' });
  }
  if (!await db.get('SELECT id FROM customers WHERE id = $1', [customer_id])) {
    return res.status(400).json({ error: 'customer_id does not exist' });
  }
  const st = status || 'Open';
  if (!STATUSES.includes(st)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  const info = await db.run(`
    INSERT INTO technical_visits (customer_id, visit_date, engineer, issue, solution_given, follow_up_date, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [customer_id, visit_date, engineer, issue, solution_given || null, follow_up_date || null, st]
  );
  res.status(201).json(await db.get(SELECT + ' WHERE v.id = $1', [info.lastId]));
}));

router.put('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM technical_visits WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Visit not found' });
  const b = req.body || {};
  const next = {
    customer_id: b.customer_id !== undefined ? b.customer_id : existing.customer_id,
    visit_date: b.visit_date !== undefined ? b.visit_date : existing.visit_date,
    engineer: b.engineer !== undefined ? b.engineer : existing.engineer,
    issue: b.issue !== undefined ? b.issue : existing.issue,
    solution_given: b.solution_given !== undefined ? b.solution_given : existing.solution_given,
    follow_up_date: b.follow_up_date !== undefined ? b.follow_up_date : existing.follow_up_date,
    status: b.status !== undefined ? b.status : existing.status
  };
  if (!await db.get('SELECT id FROM customers WHERE id = $1', [next.customer_id])) {
    return res.status(400).json({ error: 'customer_id does not exist' });
  }
  if (!STATUSES.includes(next.status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  await db.run(`UPDATE technical_visits SET customer_id = $1, visit_date = $2, engineer = $3, issue = $4,
    solution_given = $5, follow_up_date = $6, status = $7 WHERE id = $8`,
    [next.customer_id, next.visit_date, next.engineer, next.issue, next.solution_given, next.follow_up_date, next.status, existing.id]);
  res.json(await db.get(SELECT + ' WHERE v.id = $1', [existing.id]));
}));

router.delete('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM technical_visits WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Visit not found' });
  await db.run('DELETE FROM technical_visits WHERE id = $1', [row.id]);
  res.json({ deleted: true, id: Number(row.id) });
}));

module.exports = router;
