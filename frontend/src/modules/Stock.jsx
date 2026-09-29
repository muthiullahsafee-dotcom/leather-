import { useEffect, useState } from 'react';
import { getList, post, put, del } from '../apiClient.js';
import { DASH, inr2, num } from '../format.js';

const WAREHOUSES = ['Warehouse', 'Admin Office'];

// The reorder level lives on the product master, so the stock form only needs the
// product, the quantity and the place it is held.
const empty = { product_id: '', quantity: '', warehouse: 'Warehouse' };

export default function Stock() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lowOnly, setLowOnly] = useState(false);
  const [warehouse, setWarehouse] = useState('');
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    getList('/api/stock' + (lowOnly ? '?low=1' : ''))
      .then(setRows)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getList('/api/products').then(setProducts).catch(() => {});
  }, []);

  useEffect(load, [lowOnly]);

  const productById = (id) => products.find((p) => p.id === Number(id));

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    // The backend requires an item_name; the product's own name is that value, so the
    // stock row can never drift from the master it points at.
    const p = productById(form.product_id);
    if (!p) {
      setErr('Choose a chemical first.');
      return;
    }
    const payload = {
      product_id: Number(form.product_id),
      item_name: p.name,
      quantity: Number(form.quantity),
      unit: p.unit || null,
      warehouse: form.warehouse
    };
    const call = editing ? put('/api/stock/' + editing, payload) : post('/api/stock', payload);
    call
      .then(() => {
        setForm(empty);
        setEditing(null);
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const startEdit = (s) => {
    setEditing(s.id);
    setForm({
      product_id: String(s.product_id),
      quantity: String(s.quantity),
      warehouse: s.warehouse || 'Warehouse'
    });
    setErr('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = (s) => {
    if (!window.confirm('Remove stock for ' + s.product_code + ' at ' + s.warehouse + '?')) return;
    del('/api/stock/' + s.id)
      .then(load)
      .catch((ex) => setErr(ex.message));
  };

  const visible = warehouse ? rows.filter((r) => r.warehouse === warehouse) : rows;
  const lowCount = rows.filter((r) => Number(r.low_stock) === 1).length;
  const stockValue = rows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.selling_price || 0), 0);

  return (
    <div className="module-page">
      <h2>Stock</h2>
      <p>Chemical stock held at the warehouse and the admin office, flagged against the reorder level.</p>

      <div className="cards small">
        <div className="card">
          <div className="card-label">Stock Lines</div>
          <div className="card-value">{num(rows.length)}</div>
        </div>
        <div className="card card-red">
          <div className="card-label">Below Reorder Level</div>
          <div className="card-value">{num(lowCount)}</div>
        </div>
        <div className="card card-green">
          <div className="card-label">Stock Value (at selling price)</div>
          <div className="card-value">{inr2(stockValue)}</div>
        </div>
      </div>

      <div className="panel">
        <h3>{editing ? 'Adjust Stock' : 'Add Stock'}</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <select value={form.product_id} onChange={set('product_id')} required>
            <option value="">Chemical…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="any"
            placeholder="Quantity"
            value={form.quantity}
            onChange={set('quantity')}
            required
          />
          <select value={form.warehouse} onChange={set('warehouse')}>
            {WAREHOUSES.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
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
        <label className="switch">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Low stock only
        </label>
        <label>
          Place
          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="">All</option>
            {WAREHOUSES.map((w) => (
              <option key={w}>{w}</option>
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
              <th>Code</th>
              <th>Chemical</th>
              <th>Place</th>
              <th>HSN</th>
              <th>Quantity</th>
              <th>Reorder At</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} className={Number(s.low_stock) === 1 ? 'row-low' : ''}>
                <td>{s.product_code || DASH}</td>
                <td>{s.product_name || s.item_name}</td>
                <td>{s.warehouse || DASH}</td>
                <td>{s.hsn_code || DASH}</td>
                <td>
                  {num(s.quantity)} {s.unit || ''}
                </td>
                <td>
                  {s.reorder_level ? num(s.reorder_level) + ' ' + (s.unit || '') : DASH}
                </td>
                <td>
                  {Number(s.low_stock) === 1 ? (
                    <span className="tag tag-red">LOW</span>
                  ) : (
                    <span className="tag tag-green">OK</span>
                  )}
                </td>
                <td className="row-actions">
                  <button className="link" onClick={() => startEdit(s)}>
                    Adjust
                  </button>
                  <button className="link danger" onClick={() => remove(s)}>
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
