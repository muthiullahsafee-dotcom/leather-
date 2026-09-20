import { useEffect, useState } from 'react';

const empty = { code: '', name: '', price: '', sizes_available: '', sole_type: '' };

export default function Products() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    fetch('/api/products')
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
    const payload = { ...form, price: Number(form.price) };
    fetch(editing ? '/api/products/' + editing : '/api/products', {
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

  const startEdit = (p) => {
    setEditing(p.id);
    setForm({
      code: p.code,
      name: p.name,
      price: p.price,
      sizes_available: p.sizes_available || '',
      sole_type: p.sole_type || ''
    });
    setErr('');
  };

  const remove = (p) => {
    if (!window.confirm('Delete ' + p.code + '?')) return;
    fetch('/api/products/' + p.id, { method: 'DELETE' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Delete failed');
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  return (
    <div className="module-page">
      <h2>Products</h2>
      <p>Product master — styles, sizes and list prices.</p>
      <div className="panel">
        <h3>{editing ? 'Edit Product' : 'Add Product'}</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <input placeholder="Code" value={form.code} onChange={set('code')} required />
          <input placeholder="Product Name" value={form.name} onChange={set('name')} required />
          <input type="number" placeholder="Price (₹)" value={form.price} onChange={set('price')} required />
          <input placeholder="Sizes (e.g. 39,40,41)" value={form.sizes_available} onChange={set('sizes_available')} />
          <input placeholder="Sole Type" value={form.sole_type} onChange={set('sole_type')} />
          <button type="submit" className="btn">{editing ? 'Save' : 'Add'}</button>
          {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(empty); }}>Cancel</button>}
        </form>
      </div>
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Price</th><th>Sizes</th><th>Sole</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.code}</td>
                <td>{p.name}</td>
                <td>₹ {Number(p.price).toLocaleString('en-IN')}</td>
                <td>{p.sizes_available || '—'}</td>
                <td>{p.sole_type || '—'}</td>
                <td className="row-actions">
                  <button className="link" onClick={() => startEdit(p)}>Edit</button>
                  <button className="link danger" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}