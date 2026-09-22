import { Fragment, useEffect, useState } from 'react';
import { API_BASE } from '../api.js';


const STATUSES = ['Pending', 'In Production', 'Ready', 'Shipped', 'Delivered', 'Cancelled'];
const PAYMENTS = ['Unpaid', 'Partial', 'Paid'];
const today = () => new Date().toISOString().slice(0, 10);

const blankItem = () => ({ product_id: '', size: '', quantity: '', unit_price: '', unit_cost: '' });
const blankForm = () => ({
  customer_id: '',
  order_type: 'Wholesale',
  order_date: today(),
  status: 'Pending',
  payment_status: 'Unpaid',
  is_export: false,
  export_country: '',
  shipment_date: '',
  shipping_method: '',
  tracking_ref: '',
  items: [blankItem()]
});

export default function Orders() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(blankForm());
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    fetch(API_BASE + '/api/orders' + (statusFilter ? '?status=' + encodeURIComponent(statusFilter) : ''))
      .then((r) => r.json())
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch(API_BASE + '/api/customers').then((r) => r.json()).then(setCustomers).catch(() => {});
    fetch(API_BASE + '/api/products').then((r) => r.json()).then(setProducts).catch(() => {});
  }, []);

  useEffect(load, [statusFilter]);

  const setH = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm({ ...form, [k]: v });
  };

  const setItem = (idx, k) => (e) => {
    const items = form.items.slice();
    items[idx] = { ...items[idx], [k]: e.target.value };
    if (k === 'product_id') {
      const p = products.find((x) => x.id === Number(e.target.value));
      if (p && !items[idx].unit_price) items[idx].unit_price = String(p.price);
    }
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, blankItem()] });
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const buildPayload = () => ({
    customer_id: Number(form.customer_id),
    order_type: form.order_type,
    order_date: form.order_date,
    status: form.status,
    payment_status: form.payment_status,
    is_export: form.is_export ? 1 : 0,
    export_country: form.is_export ? form.export_country || null : null,
    shipment_date: form.is_export ? form.shipment_date || null : null,
    shipping_method: form.is_export ? form.shipping_method || null : null,
    tracking_ref: form.is_export ? form.tracking_ref || null : null,
    items: form.items.map((it) => ({
      product_id: Number(it.product_id),
      size: it.size,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      unit_cost: Number(it.unit_cost)
    }))
  });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    fetch(API_BASE + (editing ? '/api/orders/' + editing : '/api/orders'), {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload())
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Request failed');
        setForm(blankForm());
        setEditing(null);
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const startEdit = (o) => {
    fetch(API_BASE + '/api/orders/' + o.id)
      .then((r) => r.json())
      .then((d) => {
        setEditing(d.id);
        setForm({
          customer_id: String(d.customer_id),
          order_type: d.order_type,
          order_date: d.order_date,
          status: d.status,
          payment_status: d.payment_status,
          is_export: d.is_export === 1,
          export_country: d.export_country || '',
          shipment_date: d.shipment_date || '',
          shipping_method: d.shipping_method || '',
          tracking_ref: d.tracking_ref || '',
          items: d.items.map((it) => ({
            product_id: String(it.product_id),
            size: it.size,
            quantity: String(it.quantity),
            unit_price: String(it.unit_price),
            unit_cost: String(it.unit_cost)
          }))
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(() => {});
  };

  const patch = (id, path, body) => {
    fetch(API_BASE + '/api/orders/' + id + '/' + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Update failed');
        load();
        if (openId === id) toggleDetail(id);
      })
      .catch((ex) => setErr(ex.message));
  };

  const toggleDetail = (id) => {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    fetch(API_BASE + '/api/orders/' + id).then((r) => r.json()).then(setDetail).catch(() => {});
  };

  const remove = (o) => {
    if (!window.confirm('Delete order #' + o.id + '?')) return;
    fetch(API_BASE + '/api/orders/' + o.id, { method: 'DELETE' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Delete failed');
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  return (
    <div className="module-page">
      <h2>Orders</h2>
      <p>Sales orders, production status and shipment / export details.</p>

      <div className="panel">
        <h3>{editing ? 'Edit Order #' + editing : 'New Order'}</h3>
        {err && <div className="flash">{err}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <select value={form.customer_id} onChange={setH('customer_id')} required>
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={form.order_type} onChange={setH('order_type')}>
              <option>Wholesale</option>
              <option>Single Pair</option>
            </select>
            <input type="date" value={form.order_date} onChange={setH('order_date')} required />
            <select value={form.status} onChange={setH('status')}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={form.payment_status} onChange={setH('payment_status')}>
              {PAYMENTS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <label className="switch">
              <input type="checkbox" checked={form.is_export} onChange={setH('is_export')} />
              Export order
            </label>
          </div>

          {form.is_export && (
            <div className="form-grid export-box">
              <input placeholder="Export Country" value={form.export_country} onChange={setH('export_country')} />
              <input type="date" value={form.shipment_date} onChange={setH('shipment_date')} />
              <input placeholder="Shipping Method" value={form.shipping_method} onChange={setH('shipping_method')} />
              <input placeholder="Tracking Ref" value={form.tracking_ref} onChange={setH('tracking_ref')} />
            </div>
          )}

          <h4 className="sub-head">Items</h4>
          {form.items.map((it, idx) => (
            <div className="item-row" key={idx}>
              <select value={it.product_id} onChange={setItem(idx, 'product_id')} required>
                <option value="">Product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                ))}
              </select>
              <input placeholder="Size" value={it.size} onChange={setItem(idx, 'size')} required />
              <input type="number" placeholder="Qty" value={it.quantity} onChange={setItem(idx, 'quantity')} required />
              <input type="number" placeholder="Unit Price" value={it.unit_price} onChange={setItem(idx, 'unit_price')} required />
              <input type="number" placeholder="Unit Cost" value={it.unit_cost} onChange={setItem(idx, 'unit_cost')} required />
              {form.items.length > 1 && (
                <button type="button" className="link danger" onClick={() => removeItem(idx)}>✕</button>
              )}
            </div>
          ))}
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={addItem}>+ Add item</button>
            <button type="submit" className="btn">{editing ? 'Save Order' : 'Create Order'}</button>
            {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(blankForm()); }}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="strip">
        <label>Filter status:
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>#</th><th>Customer</th><th>Type</th><th>Date</th><th>Total</th><th>Status</th><th>Payment</th><th>Export</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <Fragment key={o.id}>
                <tr>
                  <td>{o.id}</td>
                  <td>{o.customer_name}</td>
                  <td>{o.order_type}</td>
                  <td>{o.order_date}</td>
                  <td>₹ {Number(o.total_amount).toLocaleString('en-IN')}</td>
                  <td>
                    <select value={o.status} onChange={(e) => patch(o.id, 'status', { status: e.target.value })}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={o.payment_status} onChange={(e) => patch(o.id, 'payment', { payment_status: e.target.value })}>
                      {PAYMENTS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>{o.is_export === 1 ? <span className="tag tag-blue">{o.export_country || 'Export'}</span> : '—'}</td>
                  <td className="row-actions">
                    <button className="link" onClick={() => toggleDetail(o.id)}>{openId === o.id ? 'Hide' : 'Items'}</button>
                    <button className="link" onClick={() => startEdit(o)}>Edit</button>
                    <button className="link danger" onClick={() => remove(o)}>Delete</button>
                  </td>
                </tr>
                {openId === o.id && (
                  <tr>
                    <td colSpan="9" className="detail-cell">
                      {!detail ? 'Loading…' : (
                        <>
                          {detail.is_export === 1 && (
                            <div className="detail-meta">
                              Shipment: {detail.shipment_date || '—'} · {detail.shipping_method || '—'} · Tracking {detail.tracking_ref || '—'}
                            </div>
                          )}
                          <table className="table inner">
                            <thead>
                              <tr><th>Product</th><th>Size</th><th>Qty</th><th>Unit Price</th><th>Unit Cost</th><th>Line Total</th></tr>
                            </thead>
                            <tbody>
                              {detail.items.map((it) => (
                                <tr key={it.id}>
                                  <td>{it.product_code} · {it.product_name}</td>
                                  <td>{it.size}</td>
                                  <td>{it.quantity}</td>
                                  <td>₹ {Number(it.unit_price).toLocaleString('en-IN')}</td>
                                  <td>₹ {Number(it.unit_cost).toLocaleString('en-IN')}</td>
                                  <td>₹ {Number(it.unit_price * it.quantity).toLocaleString('en-IN')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}