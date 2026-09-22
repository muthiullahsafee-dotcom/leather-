const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const TYPES = ['Income', 'Expense'];

router.get('/', wrap(async (req, res) => {
  const { type } = req.query || {};
  const rows = type
    ? await db.all('SELECT * FROM income_expenses WHERE type = $1 ORDER BY entry_date DESC, id DESC', [type])
    : await db.all('SELECT * FROM income_expenses ORDER BY entry_date DESC, id DESC');
  let balance = 0;
  for (const r of rows.reverse()) {
    balance += r.type === 'Income' ? r.amount : -r.amount;
    r.running_balance = balance;
  }
  rows.reverse();
  res.json(rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM income_expenses WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  res.json(row);
}));

router.post('/', wrap(async (req, res) => {
  const { entry_date, type, category, amount, note } = req.body || {};
  if (!entry_date || !type || type !== 'Income' && type !== 'Expense' || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'entry_date, type and amount are required (type is Income or Expense)' });
  }
  const info = await db.run(
    'INSERT INTO income_expenses (entry_date, type, category, amount, note) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [entry_date, type, category || null, amount, note || null]
  );
  res.status(201).json(await db.get('SELECT * FROM income_expenses WHERE id = $1', [info.lastId]));
}));

router.put('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM income_expenses WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });
  const b = req.body || {};
  const next = {
    entry_date: b.entry_date !== undefined ? b.entry_date : existing.entry_date,
    type: b.type !== undefined ? b.type : existing.type,
    category: b.category !== undefined ? b.category : existing.category,
    amount: b.amount !== undefined ? b.amount : existing.amount,
    note: b.note !== undefined ? b.note : existing.note
  };
  if (next.type !== 'Income' && next.type !== 'Expense') {
    return res.status(400).json({ error: 'type must be Income or Expense' });
  }
  await db.run(
    'UPDATE income_expenses SET entry_date = $1, type = $2, category = $3, amount = $4, note = $5 WHERE id = $6',
    [next.entry_date, next.type, next.category, next.amount, next.note, existing.id]
  );
  res.json(await db.get('SELECT * FROM income_expenses WHERE id = $1', [existing.id]));
}));

router.delete('/:id', wrap(async (req, res) => {
  const row = await db.get('SELECT * FROM income_expenses WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  await db.run('DELETE FROM income_expenses WHERE id = $1', [row.id]);
  res.json({ deleted: true, id: row.id });
}));

module.exports = router;