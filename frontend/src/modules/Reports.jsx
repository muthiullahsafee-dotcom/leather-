import { useEffect, useState } from 'react';
import { getList } from '../apiClient.js';
import { DASH, inr2, monthLabel, num } from '../format.js';
import { PALETTE } from '../palette.js';
import ResponsiveChart from '../ResponsiveChart.jsx';
import {
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

const money = (v) => '₹' + Number(v || 0).toLocaleString('en-IN');

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [profit, setProfit] = useState([]);
  const [stock, setStock] = useState([]);
  const [status, setStatus] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([
      getList('/api/reports/sales-over-time'),
      getList('/api/reports/profit-by-month'),
      getList('/api/reports/stock-by-product'),
      getList('/api/reports/orders-by-status'),
      getList('/api/reports/invoices-by-status')
    ])
      .then(([s, p, st, os, inv]) => {
        setSales(s.map((r) => ({ ...r, label: monthLabel(r.month) })));
        setProfit(p.map((r) => ({ ...r, label: monthLabel(r.month) })));
        setStock(st.map((r) => ({ ...r, label: r.product + ' · ' + r.warehouse })));
        setStatus(os);
        setInvoices(inv);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="module-page">
        <h2>Reports</h2>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="module-page">
      <h2>Reports</h2>
      <p>Sales, profitability, stock by chemical and fulfilment status at a glance.</p>
      {err && <div className="flash">{err}</div>}

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Sales Over Time</h3>
          <p className="chart-caption">Monthly order value, cancelled orders excluded.</p>
          <ResponsiveChart height={260}>
            {(dims) => (
              <LineChart {...dims} data={sales} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.muted} opacity={0.35} />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => (Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                <Tooltip formatter={(v) => money(v)} />
                <Line type="monotone" dataKey="sales" stroke={PALETTE.accent} strokeWidth={3} dot={{ r: 5, fill: PALETTE.accent }} />
              </LineChart>
            )}
          </ResponsiveChart>
        </div>

        <div className="chart-card">
          <h3>Profit by Month</h3>
          <p className="chart-caption">Revenue against gross margin.</p>
          <ResponsiveChart height={260}>
            {(dims) => (
              <BarChart {...dims} data={profit} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.muted} opacity={0.35} />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => (Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k' : v)} />
                <Tooltip formatter={(v) => money(v)} />
                <Legend />
                <Bar dataKey="revenue" fill={PALETTE.accent} name="Revenue" />
                <Bar dataKey="profit" fill={PALETTE.positive} name="Profit" />
              </BarChart>
            )}
          </ResponsiveChart>
        </div>

        <div className="chart-card">
          <h3>Stock by Chemical</h3>
          <p className="chart-caption">Closing quantity held at the warehouse and the admin office.</p>
          <ResponsiveChart height={260}>
            {(dims) => (
              <BarChart {...dims} data={stock} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.muted} opacity={0.35} />
                <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="quantity" fill={PALETTE.positive} name="Quantity" />
              </BarChart>
            )}
          </ResponsiveChart>
        </div>

        <div className="chart-card">
          <h3>Orders by Status</h3>
          <ResponsiveChart height={260}>
            {(dims) => (
              <PieChart {...dims}>
                <Pie data={status} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} label>
                  {status.map((entry, i) => (
                    <Cell key={entry.status} fill={PALETTE.pie[i % PALETTE.pie.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            )}
          </ResponsiveChart>
        </div>
      </div>

      <div className="panel">
        <h3>Invoice Status</h3>
        <table className="table inner">
          <thead>
            <tr>
              <th>Status</th>
              <th>Invoices</th>
              <th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan="3" className="empty">
                  No invoices raised yet.
                </td>
              </tr>
            ) : (
              invoices.map((i) => (
                <tr key={i.status}>
                  <td>{i.status}</td>
                  <td>{num(i.count)}</td>
                  <td>{inr2(i.amount_due)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Stock by Chemical</h3>
        <table className="table inner">
          <thead>
            <tr>
              <th>Code</th>
              <th>Chemical</th>
              <th>Place</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Reorder Level</th>
            </tr>
          </thead>
          <tbody>
            {stock.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty">
                  No stock rows yet.
                </td>
              </tr>
            ) : (
              stock.map((s) => (
                <tr key={s.product + '|' + s.warehouse}>
                  <td>{s.product}</td>
                  <td>{s.product_name}</td>
                  <td>{s.warehouse}</td>
                  <td>{num(s.quantity)}</td>
                  <td>{s.unit || DASH}</td>
                  <td>{s.reorder_level ? num(s.reorder_level) : DASH}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
