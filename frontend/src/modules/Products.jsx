import { useEffect, useState } from 'react';
import { getList, post, put, del } from '../apiClient.js';
import { DASH, inr2 } from '../format.js';

// GST slabs most leather chemicals fall under. Kept as a list (not a free number) so a
// typo can't create a product that can never be invoiced.
const GST_RATES = [5, 12, 18, 28];

const UNITS = ['Kg', 'Litre', 'Drum', 'Barrel', 'Bottle', 'Bag', 'Carton', 'Can', 'Pail'];

const empty = {
  code: '',
  name: '',
  hsn_code: '',
  unit: 'Kg',
  brand: '',
  purchase_price: '',
  selling_price: '',
  gst_rate: 18,
  reorder_level: ''
};

export default function Products() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const load = () =>
    getList('/api/products')
      .then(setRows)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const margin = (p) => {
    const cost = Number(p.purchase_price || 0);
    const sell = Number(p.selling_price || 0);
    if (cost <= 0 || sell <= 0) return null;
    return ((sell - cost) / sell) * 100;
  };

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    const payload = {
      code: form.code,
      name: form.name,
      hsn_code: form.hsn_code || null,
      unit: form.unit || null,
      brand: form.brand || null,
      purchase_price: form.purchase_price === '' ? null : Number(form.purchase_price),
      selling_price: Number(form.selling_price),
      gst_rate: Number(form.gst_rate),
      reorder_level: form.reorder_level === '' ? 0 : Number(form.reorder_level)
    };
    const call = editing ? put('/api/products/' + editing, payload) : post('/api/products', payload);
    call
      .then(() => {
        setForm(empty);
        setEditing(null);
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const startEdit = (p) => {
    setEditing(p.id);
    setForm({
      code: p.code,
      name: p.name,
      hsn_code: p.hsn_code || '',
      unit: p.unit || '',
      brand: p.brand || '',
      purchase_price: p.purchase_price === null || p.purchase_price === undefined ? '' : p.purchase_price,
      selling_price: p.selling_price,
      gst_rate: p.gst_rate ?? 18,
      reorder_level: p.reorder_level ?? ''
    });
    setErr('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = (p) => {
    if (!window.confirm('Delete chemical ' + p.code + ' — ' + p.name + '?')) return;
    del('/api/products/' + p.id)
      .then(load)
      .catch((ex) => setErr(ex.message));
  };

  const needle = q.trim().toLowerCase();
  const visible = needle
    ? rows.filter((p) =>
        [p.code, p.name, p.brand, p.hsn_code].some((f) => String(f || '').toLowerCase().includes(needle))
      )
    : rows;

  return (
    <div className="module-page">
      <h2>Products</h2>
      <p>Chemical master — HSN code, packing unit, brand, prices, GST rate and reorder level.</p>

      <div className="panel">
        <h3>{editing ? 'Edit Chemical ' + editing : 'Add Chemical'}</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <input placeholder="Code (e.g. CHM-001)" value={form.code} onChange={set('code')} required />
          <input placeholder="Chemical Name" value={form.name} onChange={set('name')} required />
          <input placeholder="HSN Code" value={form.hsn_code} onChange={set('hsn_code')} />
          <select value={form.unit} onChange={set('unit')}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <input placeholder="Brand" value={form.brand} onChange={set('brand')} />
          <input
            type="number"
            step="any"
            min="0"
            placeholder="Purchase Price (₹)"
            value={form.purchase_price}
            onChange={set('purchase_price')}
          />
          <input
            type="number"
            step="any"
            min="0"
            placeholder="Selling Price (₹)"
            value={form.selling_price}
            onChange={set('selling_price')}
            required
          />
          <select value={form.gst_rate} onChange={set('gst_rate')}>
            {GST_RATES.map((r) => (
              <option key={r} value={r}>
                GST {r}%
              </option>
            ))}
          </select>
          <input
            type="number"
            step="any"
            min="0"
            placeholder="Reorder Level"
            value={form.reorder_level}
            onChange={set('reorder_level')}
          />
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
          Search
          <input
            type="search"
            placeholder="Code, name, brand or HSN"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <span className="strip-note">
          {visible.length} of {rows.length} chemicals
        </span>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>HSN</th>
              <th>Unit</th>
              <th>Brand</th>
              <th>Purchase</th>
              <th>Selling</th>
              <th>Margin</th>
              <th>GST</th>
              <th>Reorder</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const m = margin(p);
              return (
                <tr key={p.id}>
                  <td>{p.code}</td>
                  <td>{p.name}</td>
                  <td>{p.hsn_code || DASH}</td>
                  <td>{p.unit || DASH}</td>
                  <td>{p.brand || DASH}</td>
                  <td>{p.purchase_price === null || p.purchase_price === undefined ? DASH : inr2(p.purchase_price)}</td>
                  <td>{inr2(p.selling_price)}</td>
                  <td>{m === null ? DASH : m.toFixed(1) + '%'}</td>
                  <td>{p.gst_rate === null || p.gst_rate === undefined ? DASH : p.gst_rate + '%'}</td>
                  <td>
                    {p.reorder_level ? Number(p.reorder_level).toLocaleString('en-IN') + ' ' + (p.unit || '') : DASH}
                  </td>
                  <td className="row-actions">
                    <button className="link" onClick={() => startEdit(p)}>
                      Edit
                    </button>
                    <button className="link danger" onClick={() => remove(p)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
