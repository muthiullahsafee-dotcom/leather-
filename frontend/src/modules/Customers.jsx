import { useEffect, useState } from 'react';
import { API_BASE } from '../api.js';

const empty = { name: '', customer_type: 'Wholesale', location: '', phone: '' };

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    fetch(API_BASE + '/api/customers')
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
    fetch(API_BASE + (editing ? '/api/customers/' + editing : '/api/customers'), {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
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

  const startEdit = (c) => {
    setEditing(c.id);
    setForm({
      name: c.name,
      customer_type: c.customer_type,
      location: c.location || '',
      phone: c.phone || ''
    });
    setErr('');
  };

  const remove = (c) => {
    if (!window.confirm('Delete customer ' + c.name + '?')) return;
    fetch(API_BASE + '/api/customers/' + c.id, { method: 'DELETE' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Delete failed');
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  return (
    <div className="module-page">
      <h2>Customers</h2>
      <p>Wholesale, export and retail accounts.</p>
      <div className="panel">
        <h3>{editing ? 'Edit Customer' : 'Add Customer'}</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <input placeholder="Customer Name" value={form.name} onChange={set('name')} required />
          <select value={form.customer_type} onChange={set('customer_type')}>
            <option>Wholesale</option>
            <option>Export</option>
            <option>Retail</option>
          </select>
          <input placeholder="Location" value={form.location} onChange={set('location')} />
          <input placeholder="Phone" value={form.phone} onChange={set('phone')} />
          <button type="submit" className="btn">{editing ? 'Save' : 'Add'}</button>
          {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(empty); }}>Cancel</button>}
        </form>
      </div>
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Location</th><th>Phone</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.customer_type}</td>
                <td>{c.location || '—'}</td>
                <td>{c.phone || '—'}</td>
                <td className="row-actions">
                  <button className="link" onClick={() => startEdit(c)}>Edit</button>
                  <button className="link danger" onClick={() => remove(c)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}