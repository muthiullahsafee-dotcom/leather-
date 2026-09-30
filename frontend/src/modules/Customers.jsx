import { useEffect, useState } from 'react';
import { getList, post, put, del } from '../apiClient.js';
import { DASH, inr2, num } from '../format.js';
import { GST_STATES } from '../states.js';

const TYPES = ['Tannery', 'Wholesale', 'Retail'];

const empty = {
  name: '',
  customer_type: 'Tannery',
  gstin: '',
  state_code: '33',
  location: '',
  phone: ''
};

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const load = () =>
    getList('/api/customers')
      .then(setRows)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    const payload = {
      name: form.name,
      customer_type: form.customer_type,
      gstin: form.gstin || null,
      state_code: form.state_code || null,
      location: form.location || null,
      phone: form.phone || null
    };
    const call = editing ? put('/api/customers/' + editing, payload) : post('/api/customers', payload);
    call
      .then(() => {
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
      gstin: c.gstin || '',
      state_code: c.state_code || '33',
      location: c.location || '',
      phone: c.phone || ''
    });
    setErr('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = (c) => {
    if (!window.confirm('Delete customer ' + c.name + '?')) return;
    del('/api/customers/' + c.id)
      .then(load)
      .catch((ex) => setErr(ex.message));
  };

  const needle = q.trim().toLowerCase();
  const visible = needle
    ? rows.filter((c) =>
        [c.name, c.location, c.gstin, c.state_name].some((f) =>
          String(f || '').toLowerCase().includes(needle)
        )
      )
    : rows;

  const totalDue = rows.reduce((s, c) => s + Number(c.amount_due || 0), 0);

  return (
    <div className="module-page">
      <h2>Customers</h2>
      <p>Tanneries, wholesalers and retailers. The GST state code decides CGST + SGST vs IGST on every invoice.</p>

      <div className="cards small">
        <div className="card">
          <div className="card-label">Customers</div>
          <div className="card-value">{num(rows.length)}</div>
        </div>
        <div className="card card-red">
          <div className="card-label">Total Outstanding</div>
          <div className="card-value">{inr2(totalDue)}</div>
        </div>
        <div className="card card-blue">
          <div className="card-label">Inter-state Buyers</div>
          <div className="card-value">{num(rows.filter((c) => c.state_code && c.state_code !== '33').length)}</div>
        </div>
      </div>

      <div className="panel">
        <h3>{editing ? 'Edit Customer' : 'Add Customer'}</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <input placeholder="Customer Name" value={form.name} onChange={set('name')} required />
          <select value={form.customer_type} onChange={set('customer_type')}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input placeholder="GSTIN" value={form.gstin} onChange={set('gstin')} />
          <select value={form.state_code} onChange={set('state_code')}>
            {GST_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          <input placeholder="Location" value={form.location} onChange={set('location')} />
          <input placeholder="Phone" value={form.phone} onChange={set('phone')} />
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
        <label className="strip-search-label">
          Search
          <input
            className="strip-search"
            type="search"
            placeholder="Name, location, GSTIN"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>GSTIN</th>
              <th>State</th>
              <th>Location</th>
              <th>Phone</th>
              <th>Orders</th>
              <th>Outstanding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.customer_type}</td>
                <td className="mono">{c.gstin || DASH}</td>
                <td>{c.state_name || DASH}</td>
                <td>{c.location || DASH}</td>
                <td>{c.phone || DASH}</td>
                <td>{num(c.order_count)}</td>
                <td>{Number(c.amount_due) > 0 ? inr2(c.amount_due) : DASH}</td>
                <td className="row-actions">
                  <button className="link" onClick={() => startEdit(c)}>
                    Edit
                  </button>
                  <button className="link danger" onClick={() => remove(c)}>
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
