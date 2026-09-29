import { useEffect, useState } from 'react';
import { getList, post, put, del } from '../apiClient.js';
import { DASH, dateLabel, inr2, num, today } from '../format.js';

const TYPES = ['Income', 'Expense'];

// The categories the demo actually uses, offered as a datalist so a new one can still
// be typed when something unexpected needs recording.
const CATEGORIES = [
  'Sales Receipt',
  'Brokerage',
  'Technical Consulting',
  'Purchase',
  'Salary',
  'Rent',
  'Travel',
  'Utilities',
  'Maintenance',
  'Bank Charges'
];

const empty = { entry_date: today(), type: 'Income', category: '', amount: '', note: '' };

export default function Ledger() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    getList('/api/income-expenses' + (typeFilter ? '?type=' + encodeURIComponent(typeFilter) : ''))
      .then(setRows)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [typeFilter]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    const payload = {
      entry_date: form.entry_date,
      type: form.type,
      category: form.category || null,
      amount: Number(form.amount),
      note: form.note || null
    };
    const call = editing ? put('/api/income-expenses/' + editing, payload) : post('/api/income-expenses', payload);
    call
      .then(() => {
        setForm(empty);
        setEditing(null);
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const startEdit = (x) => {
    setEditing(x.id);
    setForm({
      entry_date: x.entry_date,
      type: x.type,
      category: x.category || '',
      amount: x.amount,
      note: x.note || ''
    });
    setErr('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = (x) => {
    if (!window.confirm('Delete this entry?')) return;
    del('/api/income-expenses/' + x.id)
      .then(load)
      .catch((ex) => setErr(ex.message));
  };

  const income = rows.filter((r) => r.type === 'Income').reduce((s, r) => s + Number(r.amount || 0), 0);
  const expense = rows.filter((r) => r.type === 'Expense').reduce((s, r) => s + Number(r.amount || 0), 0);
  const net = income - expense;

  return (
    <div className="module-page">
      <h2>Ledger</h2>
      <p>Cash ledger — sales receipts, consulting and brokerage income, purchases and running costs.</p>

      <div className="cards small">
        <div className="card card-green">
          <div className="card-label">Income (filtered)</div>
          <div className="card-value">{inr2(income)}</div>
        </div>
        <div className="card card-red">
          <div className="card-label">Expense (filtered)</div>
          <div className="card-value">{inr2(expense)}</div>
        </div>
        <div className="card card-blue">
          <div className="card-label">Net</div>
          <div className="card-value">{inr2(net)}</div>
          <div className="card-sub">{num(rows.length)} entries</div>
        </div>
      </div>

      <div className="panel">
        <h3>{editing ? 'Edit Entry' : 'Add Entry'}</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <input type="date" value={form.entry_date} onChange={set('entry_date')} required />
          <select value={form.type} onChange={set('type')}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input
            list="ledger-categories"
            placeholder="Category"
            value={form.category}
            onChange={set('category')}
          />
          <datalist id="ledger-categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Amount (₹)"
            value={form.amount}
            onChange={set('amount')}
            required
          />
          <input placeholder="Note" value={form.note} onChange={set('note')} />
          <button type="submit" className="btn">
            {editing ? 'Save' : 'Add'}
          </button>
          {editing && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setEditing(null);
                setForm(empty);
              }}
            >
              Cancel
            </button>
          )}
        </form>
      </div>

      <div className="strip">
        <label>
          Type
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Note</th>
              <th>Running Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>{dateLabel(x.entry_date)}</td>
                <td>
                  <span className={'tag ' + (x.type === 'Income' ? 'tag-green' : 'tag-red')}>{x.type}</span>
                </td>
                <td>{x.category || DASH}</td>
                <td>
                  {x.type === 'Income' ? '+' : '−'} {inr2(Math.abs(Number(x.amount)))}
                </td>
                <td>{x.note || DASH}</td>
                <td>{inr2(x.running_balance)}</td>
                <td className="row-actions">
                  <button className="link" onClick={() => startEdit(x)}>
                    Edit
                  </button>
                  <button className="link danger" onClick={() => remove(x)}>
                    Delete
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
