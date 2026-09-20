const express = require('express');
const db = require('../db');

const router = express.Router();

const TYPES = ['Income', 'Expense'];

router.get('/', (req, res) => {
  const { type } = req.query || {};
  const rows = type
    ? db.prepare('SELECT * FROM income_expenses WHERE type = ? ORDER BY entry_date DESC, id DESC').all(type)
    : db.prepare('SELECT * FROM income_expenses ORDER BY entry_date DESC, id DESC').all();
  let balance = 0;
  for (const r of rows.reverse()) {
    balance += r.type === 'Income' ? r.amount : -r.amount;
    r.running_balance = balance;
  }
  rows.reverse();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM income_expenses WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { entry_date, type, category, amount, note } = req.body || {};
  if (!entry_date || !type || type !== 'Income' && type !== 'Expense' || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'entry_date, type and amount are required (type is Income or Expense)' });
  }
  const info = db.prepare('INSERT INTO income_expenses (entry_date, type, category, amount, note) VALUES (?, ?, ?, ?, ?)')
    .run(entry_date, type, category || null, amount, note || null);
  res.status(201).json(db.prepare('SELECT * FROM income_expenses WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM income_expenses WHERE id = ?').get(req.params.id);
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
  db.prepare('UPDATE income_expenses SET entry_date = ?, type = ?, category = ?, amount = ?, note = ? WHERE id = ?')
    .run(next.entry_date, next.type, next.category, next.amount, next.note, existing.id);
  res.json(db.prepare('SELECT * FROM income_expenses WHERE id = ?').get(existing.id));
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM income_expenses WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  db.prepare('DELETE FROM income_expenses WHERE id = ?').run(row.id);
  res.json({ deleted: true, id: row.id });
});

module.exports = router;