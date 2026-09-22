import { useEffect, useState } from 'react';
import { API_BASE, unwrapArray } from '../api.js';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { PALETTE, inr } from '../palette.js';

const today = () => new Date().toISOString().slice(0, 10);
const monthLabel = (month) => {
  if (!month) return '';
  const [y, m] = month.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[Number(m) - 1] + ' ' + y;
};

export default function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [stock, setStock] = useState([]);
  const [cashflow, setCashflow] = useState([]);
  const [salary, setSalary] = useState({ month: '', total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(API_BASE + '/api/orders').then((r) => r.json()),
      fetch(API_BASE + '/api/stock').then((r) => r.json()),
      fetch(API_BASE + '/api/reports/income-expense-by-month').then((r) => r.json()).then(unwrapArray),
      fetch(API_BASE + '/api/reports/salary-this-month').then((r) => r.json())
    ])
      .then(([o, s, c, sal]) => {
        if (!alive) return;
        setOrders(o);
        setStock(s);
        setCashflow(c.map((row) => ({ ...row, label: monthLabel(row.month) })));
        setSalary(sal || { month: '', total: 0 });
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const activeOrders = orders.filter((o) => o.status !== 'Cancelled');
  const todayNew = orders.filter((o) => o.order_date === today());
  const newValue = todayNew.reduce((s, o) => s + o.total_amount, 0);
  const pendingCount = orders.filter((o) => o.status === 'Pending').length;
  const pendingPct = activeOrders.length
    ? Math.round((pendingCount / activeOrders.length) * 100)
    : 0;
  const lowStock = stock.filter((s) => s.low_stock).length;
  const exportPending = orders.filter(
    (o) => o.is_export === 1 && o.status !== 'Cancelled' && o.status !== 'Delivered'
  ).length;

  const cards = [
    // ASSUMPTION-NEEDED: spec said "a sixth stat tile alongside the existing four", which
    // sums to five. Interpreted as ONE new tile (five total: the four existing + salary).
    { label: "Today's New Orders", value: String(todayNew.length), sub: '₹ ' + newValue.toLocaleString('en-IN'), tone: 'gold' },
    { label: 'Pending Approval', value: pendingPct + ' %', sub: pendingCount + ' order(s) waiting', tone: 'blue' },
    { label: 'Low Stock Items', value: String(lowStock), sub: 'below reorder level', tone: 'red' },
    { label: 'Export Orders Pending', value: String(exportPending), sub: 'awaiting shipment', tone: 'green' },
    { label: 'Salary Paid This Month', value: '₹ ' + Number(salary.total || 0).toLocaleString('en-IN'), sub: monthLabel(salary.month) || 'this month', tone: 'gold' }
  ];

  if (loading) {
    return <div className="module-page"><h2>Dashboard</h2><p>Loading…</p></div>;
  }

  return (
    <div className="module-page">
      <h2>Dashboard</h2>
      <p>Snap overview of Leather Stylish operations.</p>

      <div className="chart-card anchor fade-in">
        <h3>Monthly Income &amp; Profit</h3>
        <p className="chart-caption">Income, expenses and profit from the cash ledger — last 6 months.</p>
        {/* ASSUMPTION-NEEDED: spec allowed "line or bar"; used ComposedChart — bars for
            income/expenses plus a profit line — so both readings are satisfied. */}
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={cashflow} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.muted} opacity={0.35} />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip formatter={(v) => inr(v)} />
            <Legend />
            <Bar dataKey="income" name="Income" fill={PALETTE.positive} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses" fill={PALETTE.alert} radius={[3, 3, 0, 0]} />
            <Line dataKey="profit" name="Profit" stroke={PALETTE.accent} strokeWidth={2} dot={{ r: 4, fill: PALETTE.accent }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="cards dashboard-tiles">
        {cards.map((c) => (
          <div key={c.label} className={'card card-' + c.tone}>
            <div className="card-label">{c.label}</div>
            <div className="card-value">{c.value}</div>
            <div className="card-sub">{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}