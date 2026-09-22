import { useEffect, useState } from 'react';
import { API_BASE } from '../api.js';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { PALETTE, inr } from '../palette.js';

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [profit, setProfit] = useState([]);
  const [stock, setStock] = useState([]);
  const [status, setStatus] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(API_BASE + '/api/reports/sales-over-time').then((r) => r.json()),
      fetch(API_BASE + '/api/reports/profit-by-month').then((r) => r.json()),
      fetch(API_BASE + '/api/reports/stock-by-style').then((r) => r.json()),
      fetch(API_BASE + '/api/reports/orders-by-status').then((r) => r.json())
    ])
      .then(([s, p, st, os]) => {
        setSales(s);
        setProfit(p);
        setStock(st);
        setStatus(os);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="module-page"><h2>Reports</h2><p>Loading…</p></div>;
  }

  return (
    <div className="module-page">
      <h2>Reports</h2>
      <p>Sales, profitability, stock and order fulfilment at a glance.</p>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Sales Over Time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={sales} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(v) => inr(v)} />
              <Line type="monotone" dataKey="sales" stroke={PALETTE.accent} strokeWidth={3} dot={{ r: 5, fill: PALETTE.accent }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Profit by Month</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={profit} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(v) => inr(v)} />
              <Legend />
              <Bar dataKey="revenue" fill={PALETTE.accent} name="Revenue" />
              <Bar dataKey="profit" fill={PALETTE.positive} name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Stock by Style (Finished Pairs)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stock} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="style" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="pairs_available" fill={PALETTE.positive} name="Pairs" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Orders by Status</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={status} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} label>
                {status.map((entry, i) => (
                  <Cell key={entry.status} fill={PALETTE.pie[i % PALETTE.pie.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}