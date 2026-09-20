const express = require('express');
const db = require('../db');

const router = express.Router();

// Exclude cancelled orders from sales/profit aggregates so they don't inflate revenue.
// ASSUMPTION-NEEDED: Cancelled orders are treated as never-revenue. If the real build
// wants to report cancelled value separately, add a dedicated cancelled metric.
const CANCEL_CLAUSE = " AND o.status != 'Cancelled'";

router.get('/sales-over-time', (req, res) => {
  const rows = db.prepare(`
    SELECT substr(o.order_date, 1, 7) AS month, ROUND(SUM(oi.unit_price * oi.quantity), 2) AS sales
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE 1 = 1 ${CANCEL_CLAUSE}
    GROUP BY month ORDER BY month
  `).all();
  res.json(rows.map((r) => ({ month: r.month, sales: r.sales })));
});

router.get('/profit-by-month', (req, res) => {
  const rows = db.prepare(`
    SELECT substr(o.order_date, 1, 7) AS month,
           ROUND(SUM(oi.unit_price * oi.quantity), 2) AS revenue,
           ROUND(SUM(oi.unit_cost * oi.quantity), 2) AS cost,
           ROUND(SUM((oi.unit_price - oi.unit_cost) * oi.quantity), 2) AS profit
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE 1 = 1 ${CANCEL_CLAUSE}
    GROUP BY month ORDER BY month
  `).all();
  res.json(rows);
});

router.get('/stock-by-style', (req, res) => {
  const rows = db.prepare(`
    SELECT p.code AS style, p.name AS product_name, SUM(si.quantity) AS pairs_available
    FROM stock_items si
    JOIN products p ON si.product_id = p.id
    WHERE si.item_type = 'Finished Stock'
    GROUP BY p.id ORDER BY p.code
  `).all();
  res.json(rows);
});

router.get('/orders-by-status', (req, res) => {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM orders GROUP BY status ORDER BY status
  `).all();
  res.json(rows);
});

// Monthly Income / Expenses / Profit from the cash ledger (income_expenses).
// ASSUMPTION-NEEDED: the dashboard "Monthly Income & Profit" chart is built from the
// ledger (type Income/Expense), not from order sales, so salaries and rent are included.
// "Last 6 months of data" = the 6 most recent months that have ledger entries.
router.get('/income-expense-by-month', (req, res) => {
  const rows = db.prepare(`
    SELECT substr(entry_date, 1, 7) AS month,
           ROUND(SUM(CASE WHEN type = 'Income'  THEN amount ELSE 0 END), 2) AS income,
           ROUND(SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END), 2) AS expenses
    FROM income_expenses
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `).all().reverse();
  res.json(rows.map((r) => ({
    month: r.month,
    income: r.income,
    expenses: r.expenses,
    profit: Number((r.income - r.expenses).toFixed(2))
  })));
});

// Total salary expense recorded in the current calendar month.
// ASSUMPTION-NEEDED (pre-flagged): "how many salary working" is interpreted as total
// monthly salary spend, from income_expenses where type=Expense and category contains
// "Salary" (case-insensitive) — not an employee headcount feature.
// ASSUMPTION-NEEDED: "current month" uses the server's system date.
router.get('/salary-this-month', (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const row = db.prepare(`
    SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total
    FROM income_expenses
    WHERE type = 'Expense'
      AND lower(COALESCE(category, '')) LIKE '%salary%'
      AND substr(entry_date, 1, 7) = ?
  `).get(month);
  res.json({ month, total: row.total });
});

module.exports = router;