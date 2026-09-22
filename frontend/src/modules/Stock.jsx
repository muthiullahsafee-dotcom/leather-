import { useEffect, useState } from 'react';
import { API_BASE } from '../api.js';

const empty = { item_name: '', item_type: 'Raw Material', product_id: '', size: '', quantity: '', unit: '', reorder_threshold: '' };

export default function Stock() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lowOnly, setLowOnly] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    fetch(API_BASE + '/api/stock' + (lowOnly ? '?low=1' : ''))
      .then((r) => r.json())
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch(API_BASE + '/api/products')
      .then((r) => r.json())
      .then(setProducts)
      .catch(() => {});
  }, []);

  useEffect(load, [lowOnly]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    const payload = {
      item_name: form.item_name,
      item_type: form.item_type,
      product_id: form.product_id ? Number(form.product_id) : null,
      size: form.size || null,
      quantity: Number(form.quantity),
      unit: form.unit || null,
      reorder_threshold: Number(form.reorder_threshold)
    };
    fetch(API_BASE + (editing ? '/api/stock/' + editing : '/api/stock'), {
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

  const startEdit = (s) => {
    setEditing(s.id);
    setForm({
      item_name: s.item_name,
      item_type: s.item_type,
      product_id: s.product_id || '',
      size: s.size || '',
      quantity: s.quantity,
      unit: s.unit || '',
      reorder_threshold: s.reorder_threshold
    });
    setErr('');
  };

  const remove = (s) => {
    if (!window.confirm('Delete stock item ' + s.item_name + '?')) return;
    fetch(API_BASE + '/api/stock/' + s.id, { method: 'DELETE' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Delete failed');
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  return (
    <div className="module-page">
      <h2>Stock Management</h2>
      <p>Raw material and finished stock with reorder flags.</p>
      <div className="strip">
        <label className="switch">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Low stock only
        </label>
      </div>
      <div className="panel">
        <h3>{editing ? 'Edit Stock Item' : 'Add Stock Item'}</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <select value={form.item_type} onChange={set('item_type')}>
            <option>Raw Material</option>
            <option>Finished Stock</option>
          </select>
          <input placeholder="Item Name" value={form.item_name} onChange={set('item_name')} required />
          <select value={form.product_id} onChange={set('product_id')}>
            <option value="">— none —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
            ))}
          </select>
          <input placeholder="Size" value={form.size} onChange={set('size')} />
          <input type="number" placeholder="Quantity" value={form.quantity} onChange={set('quantity')} required />
          <input placeholder="Unit" value={form.unit} onChange={set('unit')} />
          <input type="number" placeholder="Reorder Threshold" value={form.reorder_threshold} onChange={set('reorder_threshold')} required />
          <button type="submit" className="btn">{editing ? 'Save' : 'Add'}</button>
          {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(empty); }}>Cancel</button>}
        </form>
      </div>
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Item</th><th>Type</th><th>Product</th><th>Size</th><th>Quantity</th><th>Reorder</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className={s.low_stock ? 'row-low' : ''}>
                <td>{s.item_name}</td>
                <td>{s.item_type}</td>
                <td>{s.product_code ? s.product_code : '—'}</td>
                <td>{s.size || '—'}</td>
                <td>{s.quantity} {s.unit || ''}</td>
                <td>{s.reorder_threshold}</td>
                <td>{s.low_stock ? <span className="tag tag-red">LOW</span> : <span className="tag tag-green">OK</span>}</td>
                <td className="row-actions">
                  <button className="link" onClick={() => startEdit(s)}>Edit</button>
                  <button className="link danger" onClick={() => remove(s)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}