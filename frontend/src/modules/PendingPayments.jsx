import { useEffect, useState } from 'react';
import { get, post } from '../apiClient.js';
import { DASH, dateLabel, dueLabel, inr2, num, today } from '../format.js';

const MODES = ['NEFT', 'RTGS', 'Cheque', 'Cash', 'UPI'];

// The backend ages from the due date, so "0-30" includes everything not yet overdue
// as well as the first 30 days late. The labels say so plainly rather than implying
// 0-30 means "overdue by up to 30 days".
const BUCKETS = [
  { key: '0-30', label: 'Not overdue / up to 30 days', tone: '' },
  { key: '31-60', label: '31–60 days overdue', tone: 'overdue-1' },
  { key: '60+', label: 'Over 60 days overdue', tone: 'overdue-2' }
];

export default function PendingPayments({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [pay, setPay] = useState({ invoice_id: '', amount: '', mode: 'NEFT', payment_date: today(), note: '' });

  const load = () => {
    setLoading(true);
    get('/api/invoices/pending')
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const record = (e) => {
    e.preventDefault();
    setErr('');
    setNote('');
    post('/api/invoices/' + pay.invoice_id + '/payments', {
      amount: Number(pay.amount),
      mode: pay.mode,
      payment_date: pay.payment_date,
      note: pay.note || null
    })
      .then((inv) => {
        setNote('Receipt of ' + inr2(pay.amount) + ' recorded against ' + inv.invoice_no + '.');
        setPay({ invoice_id: '', amount: '', mode: 'NEFT', payment_date: today(), note: '' });
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const items = (data && data.items) || [];
  const visible = bucket ? items.filter((i) => i.bucket === bucket) : items;
  const asOf = data ? dateLabel(data.as_of) : '';

  if (loading) {
    return (
      <div className="module-page">
        <h2>Pending Payments</h2>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="module-page">
      <h2>Pending Payments</h2>
      <p>Everything still owing from buyers, with ageing measured from each invoice's due date.</p>

      <div className="cards small">
        <div className="card card-red">
          <div className="card-label">Total Outstanding</div>
          <div className="card-value">{inr2((data && data.total_due) || 0)}</div>
          <div className="card-sub">
            Across {num((data && data.invoice_count) || 0)} invoices
          </div>
        </div>
        <div className="card card-amber">
          <div className="card-label">Overdue</div>
          <div className="card-value">{inr2((data && data.overdue_total) || 0)}</div>
          <div className="card-sub">Past the due date</div>
        </div>
        <div className="card">
          <div className="card-label">As On</div>
          <div className="card-value card-value-sm">{asOf}</div>
        </div>
      </div>

      <div className="bucket-grid">
        {BUCKETS.map((b) => (
          <div key={b.key} className={'bucket ' + b.tone}>
            <div className="bucket-label">{b.label}</div>
            <div className="bucket-value">{inr2((data && data.buckets && data.buckets[b.key]) || 0)}</div>
            <div className="bucket-count">
              {num((data && data.bucket_counts && data.bucket_counts[b.key]) || 0)} invoices
            </div>
          </div>
        ))}
      </div>

      {err && <div className="flash">{err}</div>}
      {note && <div className="flash ok">{note}</div>}

      <div className="panel">
        <h3>Record a Receipt</h3>
        <form className="form-grid" onSubmit={record}>
          <select
            value={pay.invoice_id}
            onChange={(e) => {
              const inv = items.find((i) => String(i.id) === e.target.value);
              setPay({ ...pay, invoice_id: e.target.value, amount: inv ? String(inv.amount_due) : '' });
            }}
            required
          >
            <option value="">Select invoice…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.invoice_no} · {i.customer_name} · {inr2(i.amount_due)} due
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Amount (₹)"
            value={pay.amount}
            onChange={(e) => setPay({ ...pay, amount: e.target.value })}
            required
          />
          <select value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>
            {MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input
            type="date"
            value={pay.payment_date}
            onChange={(e) => setPay({ ...pay, payment_date: e.target.value })}
            required
          />
          <input
            placeholder="Note (e.g. RTGS ref)"
            value={pay.note}
            onChange={(e) => setPay({ ...pay, note: e.target.value })}
          />
          <button type="submit" className="btn" disabled={items.length === 0}>
            Record Receipt
          </button>
        </form>
      </div>

      <div className="strip">
        <label>
          Ageing
          <select value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="">All</option>
            {BUCKETS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <span className="strip-note">{visible.length} invoices shown</span>
      </div>

      {items.length === 0 ? (
        <p className="empty">
          Nothing is outstanding. {onNavigate ? 'Raise an invoice from ' : ''}
          {onNavigate && (
            <button className="link" onClick={() => onNavigate('orders')}>
              an order
            </button>
          )}
          .
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Invoice Date</th>
              <th>Due Date</th>
              <th>Ageing</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Outstanding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.id} className={i.is_overdue ? 'row-low' : ''}>
                <td>{i.invoice_no}</td>
                <td>{i.customer_name}</td>
                <td>{dateLabel(i.invoice_date)}</td>
                <td>{dateLabel(i.due_date)}</td>
                <td>
                  <span className={'tag ' + (i.is_overdue ? 'tag-red' : 'tag-gray')}>{dueLabel(i.due_date)}</span>
                </td>
                <td>{inr2(i.total_amount)}</td>
                <td>{inr2(i.amount_paid)}</td>
                <td>{inr2(i.amount_due)}</td>
                <td className="row-actions">
                  <button
                    className="link"
                    onClick={() =>
                      setPay({ invoice_id: String(i.id), amount: String(i.amount_due), mode: 'NEFT', payment_date: today(), note: '' })
                    }
                  >
                    Pay
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
