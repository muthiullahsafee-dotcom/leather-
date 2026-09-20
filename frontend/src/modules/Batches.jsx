import { useEffect, useState } from 'react';

const STAGES = ['Cutting', 'Stitching', 'Finishing', 'Quality Check', 'Packed'];
const today = () => new Date().toISOString().slice(0, 10);
const empty = { batch_code: '', product_id: '', quantity: '', start_date: today(), expected_completion_date: '', stage: 'Cutting', linked_order_id: '' };

export default function Batches() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('');
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/batches' + (stageFilter ? '?stage=' + encodeURIComponent(stageFilter) : ''))
      .then((r) => r.json())
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch('/api/products').then((r) => r.json()).then(setProducts).catch(() => {});
    fetch('/api/orders').then((r) => r.json()).then(setOrders).catch(() => {});
  }, []);

  useEffect(load, [stageFilter]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    const payload = {
      batch_code: form.batch_code,
      product_id: Number(form.product_id),
      quantity: Number(form.quantity),
      start_date: form.start_date || null,
      expected_completion_date: form.expected_completion_date || null,
      stage: form.stage,
      linked_order_id: form.linked_order_id ? Number(form.linked_order_id) : null
    };
    const url = editing ? '/api/batches/' + editing : '/api/batches';
    const method = editing ? 'PUT' : 'POST';
    if (editing) {
      delete payload.product_id;
      delete payload.start_date;
      delete payload.expected_completion_date;
      delete payload.linked_order_id;
    }
    fetch(url, {
      method,
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

  const startEdit = (b) => {
    setEditing(b.id);
    setForm({
      batch_code: b.batch_code,
      product_id: String(b.product_id),
      quantity: b.quantity,
      start_date: b.start_date || today(),
      expected_completion_date: b.expected_completion_date || '',
      stage: b.stage,
      linked_order_id: b.linked_order_id ? String(b.linked_order_id) : ''
    });
    setErr('');
  };

  const advance = (b) => {
    fetch('/api/batches/' + b.id + '/advance', { method: 'POST' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Advance failed');
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const remove = (b) => {
    if (!window.confirm('Delete batch ' + b.batch_code + '?')) return;
    fetch('/api/batches/' + b.id, { method: 'DELETE' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Delete failed');
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const stageBadge = (stage) => {
    const idx = STAGES.indexOf(stage);
    return <span className="tag tag-blue">{stage} ({idx + 1}/{STAGES.length})</span>;
  };

  return (
    <div className="module-page">
      <h2>Production Batches</h2>
      <p>Track each batch through cutting, stitching, finishing, quality and packing.</p>
      <div className="panel">
        <h3>{editing ? 'Edit Batch' : 'New Batch'}</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <input placeholder="Batch Code" value={form.batch_code} onChange={set('batch_code')} required />
          <select value={form.product_id} onChange={set('product_id')} required disabled={!!editing}>
            <option value="">Product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
          <input type="number" placeholder="Quantity" value={form.quantity} onChange={set('quantity')} required />
          <input type="date" value={form.start_date} onChange={set('start_date')} disabled={!!editing} />
          <input type="date" value={form.expected_completion_date} onChange={set('expected_completion_date')} disabled={!!editing} />
          <select value={form.stage} onChange={set('stage')}>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={form.linked_order_id} onChange={set('linked_order_id')} disabled={!!editing}>
            <option value="">Link order (optional)…</option>
            {orders.map((o) => <option key={o.id} value={o.id}>#{o.id} · {o.customer_name}</option>)}
          </select>
          <button type="submit" className="btn">{editing ? 'Save' : 'Add'}</button>
          {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(empty); }}>Cancel</button>}
        </form>
      </div>

      <div className="strip">
        <label>Stage:
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="">All</option>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Code</th><th>Product</th><th>Qty</th><th>Stage</th><th>Order</th><th>Customer</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{b.batch_code}</td>
                <td>{b.product_code || '—'}</td>
                <td>{b.quantity}</td>
                <td>{stageBadge(b.stage)}</td>
                <td>{b.linked_order_id ? '#' + b.linked_order_id : '—'}</td>
                <td>{b.linked_customer_name || '—'}</td>
                <td className="row-actions">
                  {b.stage !== 'Packed' && <button className="link" onClick={() => advance(b)}>Advance</button>}
                  <button className="link" onClick={() => startEdit(b)}>Edit</button>
                  <button className="link danger" onClick={() => remove(b)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}