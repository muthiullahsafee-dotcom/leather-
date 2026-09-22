import { useEffect, useState } from 'react';
import { API_BASE } from '../api.js';

const today = () => new Date().toISOString().slice(0, 10);
const empty = { entry_date: today(), type: 'Income', category: '', amount: '', note: '' };

export default function Ledger() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    fetch(API_BASE + '/api/income-expenses')
      .then((r) => r.json())
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    const payload = { ...form, amount: Number(form.amount) };
    fetch(API_BASE + (editing ? '/api/income-expenses/' + editing : '/api/income-expenses'), {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Request failed');
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
  };

  const remove = (x) => {
    if (!window.confirm('Delete this entry?')) return;
    fetch(API_BASE + '/api/income-expenses/' + x.id, { method: 'DELETE' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Delete failed');
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const income = rows.filter((r) => r.type === 'Income').reduce((s, r) => s + r.amount, 0);
  const expense = rows.filter((r) => r.type === 'Expense').reduce((s, r) => s + r.amount, 0);
  const net = income - expense;

  return (
    <div className="module-page">
      <h2>Income &amp; Expenses</h2>
      <p>Cash ledger with running balance.</p>

      <div className="cards small">
        <div className="card card-green">
          <div className="card-label">Total Income</div>
          <div className="card-value">₹ {income.toLocaleString('en-IN')}</div>
        </div>
        <div className="card card-red">
          <div className="card-label">Total Expense</div>
          <div className="card-value">₹ {expense.toLocaleString('en-IN')}</div>
        </div>
        <div className="card card-blue">
          <div className="card-label">Net</div>
          <div className="card-value">₹ {net.toLocaleString('en-IN')}</div>
        </div>
      </div>

      <div className="panel">
        <h3>{editing ? 'Edit Entry' : 'Add Entry'}</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <input type="date" value={form.entry_date} onChange={set('entry_date')} required />
          <select value={form.type} onChange={set('type')}>
            <option>Income</option>
            <option>Expense</option>
          </select>
          <input placeholder="Category" value={form.category} onChange={set('category')} />
          <input type="number" placeholder="Amount (₹)" value={form.amount} onChange={set('amount')} required />
          <input placeholder="Note" value={form.note} onChange={set('note')} />
          <button type="submit" className="btn">{editing ? 'Save' : 'Add'}</button>
          {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(empty); }}>Cancel</button>}
        </form>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Note</th><th>Running Balance</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>{x.entry_date}</td>
                <td>{x.type === 'Income' ? <span className="tag tag-green">Income</span> : <span className="tag tag-red">Expense</span>}</td>
                <td>{x.category || '—'}</td>
                <td>₹ {Number(x.amount).toLocaleString('en-IN')}</td>
                <td>{x.note || '—'}</td>
                <td>₹ {Number(x.running_balance).toLocaleString('en-IN')}</td>
                <td className="row-actions">
                  <button className="link" onClick={() => startEdit(x)}>Edit</button>
                  <button className="link danger" onClick={() => remove(x)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}