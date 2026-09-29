import { useEffect, useState } from 'react';
import { get, getList } from '../apiClient.js';
import { dateLabel, inr2, monthLabel } from '../format.js';
import { PALETTE } from '../palette.js';
import ResponsiveChart from '../ResponsiveChart.jsx';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

// The dashboard reads the report endpoints rather than recomputing anything, so the
// tiles and the Reports screen can never disagree about the same number.
const TILES = [
  { id: 'orders-today', label: "Today's New Orders", tone: 'gold', go: 'orders' },
  { id: 'pending-approval', label: 'Pending Approval', tone: 'blue', go: 'orders' },
  { id: 'pending-payments', label: 'Pending Payments', tone: 'red', go: 'pending' },
  { id: 'low-stock', label: 'Low Stock Chemicals', tone: 'green', go: 'stock' },
  { id: 'salary', label: 'Salary Paid This Month', tone: 'gold', go: 'ledger' }
];

// Order of value and sub-label per tile, kept outside the component so the markup
// below stays a straight map over TILES.
function tileValue(id, tile, lowStock) {
  if (id === 'orders-today') {
    return {
      money: '₹' + Number(tile['orders-today'].total_amount || 0).toLocaleString('en-IN'),
      value: String(tile['orders-today'].count ?? 0),
      sub: 'Worth ' + Number(tile['orders-today'].total_amount || 0).toLocaleString('en-IN') +
        ' · ' + (tile['orders-today'].date ? dateLabel(tile['orders-today'].date) : 'today')
    };
  }
  if (id === 'pending-approval') {
    const n = tile['pending-approval'].count ?? 0;
    return { value: String(n), sub: n + (n === 1 ? ' order' : ' orders') + ' waiting for approval' };
  }
  if (id === 'pending-payments') {
    const p = tile['pending-payments'];
    const invoices = p.invoice_count ?? 0;
    const noun = invoices === 1 ? ' invoice' : ' invoices';
    return {
      value: '₹' + Number(p.total_due || 0).toLocaleString('en-IN'),
      sub: 'Across ' + invoices + noun + (p.overdue_count ? ' · ' + p.overdue_count + ' overdue' : ' · nothing overdue')
    };
  }
  if (id === 'low-stock') {
    return {
      value: String(lowStock.length),
      sub: lowStock.length === 1 ? 'chemical below reorder level' : 'chemicals below reorder level'
    };
  }
  return {
    value: '₹' + Number(tile.salary.total || 0).toLocaleString('en-IN'),
    sub: (monthLabel(tile.salary.month) || 'This month') + ' · salary & wages'
  };
}

export default function Dashboard({ onNavigate }) {
  const [tile, setTile] = useState({
    'orders-today': { count: 0, total_amount: 0, date: '' },
    'pending-approval': { count: 0, orders: [] },
    'pending-payments': { invoice_count: 0, total_due: 0, overdue_count: 0, overdue_total: 0 },
    salary: { month: '', total: 0 }
  });
  const [stock, setStock] = useState([]);
  const [cashflow, setCashflow] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      get('/api/reports/orders-today'),
      get('/api/reports/pending-approval'),
      get('/api/reports/pending-payments'),
      get('/api/reports/salary-this-month'),
      getList('/api/stock'),
      getList('/api/reports/income-expense-by-month')
    ])
      .then(([ordersToday, approval, payments, salary, stockRows, flow]) => {
        if (!alive) return;
        setTile({
          'orders-today': ordersToday,
          'pending-approval': approval,
          'pending-payments': payments,
          salary
        });
        setStock(stockRows);
        setCashflow(flow.map((row) => ({ ...row, label: monthLabel(row.month) })));
      })
      .catch((e) => {
        if (alive) setErr(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const lowStock = stock.filter((s) => Number(s.low_stock) === 1);
  const approvals = tile['pending-approval'].orders || [];

  if (loading) {
    return (
      <div className="module-page">
        <h2>Dashboard</h2>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="module-page">
      <h2>Dashboard</h2>
      <p>Snap overview of Surya Tech — chemicals, orders, receivables and stock.</p>
      {err && <div className="flash">{err}</div>}

      <div className="cards dashboard-tiles">
        {TILES.map((t) => {
          const v = tileValue(t.id, tile, lowStock);
          return (
            <button
              key={t.id}
              type="button"
              className={'card card-' + t.tone + ' card-link'}
              onClick={() => onNavigate && onNavigate(t.go)}
              title={'Open ' + t.label}
            >
              <div className="card-label">{t.label}</div>
              <div className="card-value">{v.value}</div>
              <div className="card-sub">{v.sub}</div>
              <span className="card-action">Open →</span>
            </button>
          );
        })}
      </div>

      <div className="chart-card anchor fade-in">
        <h3>Monthly Income &amp; Profit</h3>
        <p className="chart-caption">Income, expenses and profit from the cash ledger — last 6 months.</p>
        {/* ASSUMPTION-NEEDED: spec allowed "line or bar"; used ComposedChart — bars for
            income/expenses plus a profit line — so both readings are satisfied. */}
        <ResponsiveChart height={320}>
          {(dims) => (
            <ComposedChart {...dims} data={cashflow} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.muted} opacity={0.35} />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => (Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
              <Tooltip formatter={(v) => '₹' + Number(v).toLocaleString('en-IN')} />
              <Legend />
              <Bar dataKey="income" name="Income" fill={PALETTE.positive} radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill={PALETTE.alert} radius={[3, 3, 0, 0]} />
              <Line dataKey="profit" name="Profit" stroke={PALETTE.accent} strokeWidth={2} dot={{ r: 4, fill: PALETTE.accent }} />
            </ComposedChart>
          )}
        </ResponsiveChart>
      </div>

      <div className="dash-split">
        <div className="panel">
          <h3>Pending Approval</h3>
          {approvals.length === 0 ? (
            <p className="empty">Nothing is waiting for approval.</p>
          ) : (
            <ul className="mini-list">
              {approvals.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <span>
                    <span className="mini-name">{o.order_no}</span>
                    <span className="mini-meta"> · {o.customer_name}</span>
                  </span>
                  <span>{inr2(o.total_amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h3>Low Stock</h3>
          {lowStock.length === 0 ? (
            <p className="empty">Every chemical is above its reorder level.</p>
          ) : (
            <ul className="mini-list">
              {lowStock.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <span>
                    <span className="mini-name">{s.product_code}</span>
                    <span className="mini-meta"> · {s.product_name}</span>
                  </span>
                  <span>
                    {s.quantity} {s.unit || ''} <span className="tag tag-red">LOW</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
