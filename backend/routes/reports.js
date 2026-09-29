const express = require('express');
const db = require('../db');
const { today: todayISO, thisMonth, addDays, daysBetween } = require('../dates');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Exclude cancelled orders from sales/profit aggregates so they don't inflate revenue.
// ASSUMPTION-NEEDED: Cancelled orders are treated as never-revenue. If the real build
// wants to report cancelled value separately, add a dedicated cancelled metric.
const CANCEL_CLAUSE = " AND o.status != 'Cancelled'";

router.get('/sales-over-time', wrap(async (req, res) => {
  const rows = await db.all(`
    SELECT substr(o.order_date, 1, 7) AS month, ROUND(SUM(oi.unit_price * oi.quantity), 2) AS sales
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE 1 = 1 ${CANCEL_CLAUSE}
    GROUP BY month ORDER BY month
  `);
  res.json(rows.map((r) => ({ month: r.month, sales: r.sales })));
}));

router.get('/profit-by-month', wrap(async (req, res) => {
  const rows = await db.all(`
    SELECT substr(o.order_date, 1, 7) AS month,
           ROUND(SUM(oi.unit_price * oi.quantity), 2) AS revenue,
           ROUND(SUM(oi.unit_cost * oi.quantity), 2) AS cost,
           ROUND(SUM((oi.unit_price - oi.unit_cost) * oi.quantity), 2) AS profit
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE 1 = 1 ${CANCEL_CLAUSE}
    GROUP BY month ORDER BY month
  `);
  res.json(rows);
}));

// Closing stock per chemical, split by the two places it is held.
router.get('/stock-by-product', wrap(async (req, res) => {
  const rows = await db.all(`
    SELECT p.code AS product, p.name AS product_name, p.unit, p.reorder_level,
           s.warehouse, SUM(s.quantity) AS quantity
    FROM stock_items s
    JOIN products p ON s.product_id = p.id
    GROUP BY p.id, p.code, p.name, p.unit, p.reorder_level, s.warehouse
    ORDER BY p.code, s.warehouse
  `);
  res.json(rows);
}));

router.get('/orders-by-status', wrap(async (req, res) => {
  const rows = await db.all(`
    SELECT status, COUNT(*) AS count
    FROM orders GROUP BY status ORDER BY status
  `);
  res.json(rows);
}));

router.get('/invoices-by-status', wrap(async (req, res) => {
  const rows = await db.all(`
    SELECT status, COUNT(*) AS count, ROUND(COALESCE(SUM(amount_due), 0), 2) AS amount_due
    FROM invoices GROUP BY status ORDER BY status
  `);
  res.json(rows);
}));

// Monthly Income / Expenses / Profit from the cash ledger (income_expenses).
// ASSUMPTION-NEEDED: the dashboard "Monthly Income & Profit" chart is built from the
// ledger (type Income/Expense), not from order sales, so salaries, rent and the
// consulting / brokerage income are all included.
// "Last 6 months of data" = the 6 most recent months that have ledger entries.
router.get('/income-expense-by-month', wrap(async (req, res) => {
  const rows = await db.all(`
    SELECT substr(entry_date, 1, 7) AS month,
           ROUND(SUM(CASE WHEN type = 'Income'  THEN amount ELSE 0 END), 2) AS income,
           ROUND(SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END), 2) AS expenses
    FROM income_expenses
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `);
  res.json(rows.reverse().map((r) => ({
    month: r.month,
    income: r.income,
    expenses: r.expenses,
    profit: Number((r.income - r.expenses).toFixed(2))
  })));
}));

// Total salary expense recorded in the current calendar month.
// ASSUMPTION-NEEDED (pre-flagged): "how many salary working" is interpreted as total
// monthly salary spend, from income_expenses where type=Expense and category contains
// "Salary" (case-insensitive) — not an employee headcount feature.
// ASSUMPTION-NEEDED: "current month" uses the server's system date.
router.get('/salary-this-month', wrap(async (req, res) => {
  const month = thisMonth();
  const row = await db.get(`
    SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total
    FROM income_expenses
    WHERE type = 'Expense'
      AND lower(COALESCE(category, '')) LIKE '%salary%'
      AND substr(entry_date, 1, 7) = $1
  `, [month]);
  res.json({ month, total: row.total });
}));

// The dashboard's "Pending Payments" tile. Reads the same open receivables as
// GET /api/invoices/pending so the two can never disagree.
router.get('/pending-payments', wrap(async (req, res) => {
  const today = todayISO();
  const row = await db.get(`
    SELECT COUNT(*) AS invoice_count, ROUND(COALESCE(SUM(amount_due), 0), 2) AS total_due
    FROM invoices WHERE amount_due > 0
  `);
  const overdue = await db.get(`
    SELECT COUNT(*) AS invoice_count, ROUND(COALESCE(SUM(amount_due), 0), 2) AS total_due
    FROM invoices WHERE amount_due > 0 AND due_date < $1
  `, [today]);
  res.json({
    as_of: today,
    invoice_count: row.invoice_count,
    total_due: row.total_due,
    overdue_count: overdue.invoice_count,
    overdue_total: overdue.total_due
  });
}));

// The dashboard's "Today's New Orders" tile. Orders are stored as plain calendar-date
// strings, so the comparison is a string match against the seller's local today.
router.get('/orders-today', wrap(async (req, res) => {
  const date = todayISO();
  const row = await db.get(`
    SELECT COUNT(*) AS count, ROUND(COALESCE(SUM(total_amount), 0), 2) AS total_amount
    FROM orders WHERE order_date = $1
  `, [date]);
  res.json({ date, count: row.count, total_amount: row.total_amount });
}));

// The dashboard's "Pending Approval" tile, with the orders themselves so the tile can
// link straight to the list it describes.
router.get('/pending-approval', wrap(async (req, res) => {
  const rows = await db.all(`
    SELECT o.id, o.order_no, o.order_date, o.total_amount, c.name AS customer_name
    FROM orders o JOIN customers c ON o.customer_id = c.id
    WHERE o.status = 'Pending Approval'
    ORDER BY o.order_date, o.id
  `);
  res.json({ count: rows.length, orders: rows });
}));

module.exports = router;
