import { useEffect, useState } from 'react';
import { getList, post, put, del } from '../apiClient.js';
import { DASH, dateLabel, num, qty, today } from '../format.js';

const STATUSES = ['Received', 'In Stock', 'Partly Issued', 'Expired'];
const WAREHOUSES = ['Warehouse', 'Admin Office'];

const empty = {
  lot_no: '',
  product_id: '',
  supplier: '',
  received_date: today(),
  expiry_date: '',
  quantity: '',
  status: 'In Stock',
  warehouse: 'Warehouse',
  linked_order_id: ''
};

const tagFor = (s) =>
  s === 'In Stock' ? 'tag-green' : s === 'Partly Issued' ? 'tag-blue' : s === 'Expired' ? 'tag-red' : 'tag-gray';

export default function Lots() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    getList('/api/lots' + (statusFilter ? '?status=' + encodeURIComponent(statusFilter) : ''))
      .then(setRows)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getList('/api/products').then(setProducts).catch(() => {});
    getList('/api/orders').then(setOrders).catch(() => {});
  }, []);

  useEffect(load, [statusFilter]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // The backend only lets a lot's lot_no, quantity, status, warehouse and expiry change
  // after creation, so the other fields are locked while editing.
  const locked = !!editing;

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    const payload = {
      lot_no: form.lot_no,
      quantity: Number(form.quantity),
      status: form.status,
      warehouse: form.warehouse,
      expiry_date: form.expiry_date || null
    };
    if (!editing) {
      payload.product_id = Number(form.product_id);
      payload.supplier = form.supplier;
      payload.received_date = form.received_date;
      payload.linked_order_id = form.linked_order_id ? Number(form.linked_order_id) : null;
    }
    const call = editing ? put('/api/lots/' + editing, payload) : post('/api/lots', payload);
    call
      .then(() => {
        setForm(empty);
        setEditing(null);
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const startEdit = (l) => {
    setEditing(l.id);
    setForm({
      lot_no: l.lot_no,
      product_id: String(l.product_id),
      supplier: l.supplier || '',
      received_date: l.received_date || today(),
      expiry_date: l.expiry_date || '',
      quantity: String(l.quantity),
      status: l.status,
      warehouse: l.warehouse || 'Warehouse',
      linked_order_id: l.linked_order_id ? String(l.linked_order_id) : ''
    });
    setErr('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const advance = (l) => {
    setErr('');
    post('/api/lots/' + l.id + '/advance', {})
      .then(load)
      .catch((e) => setErr(e.message));
  };

  const remove = (l) => {
    if (!window.confirm('Delete lot ' + l.lot_no + '?')) return;
    del('/api/lots/' + l.id)
      .then(load)
      .catch((e) => setErr(e.message));
  };

  const expired = rows.filter((l) => l.status === 'Expired').length;
  const expiringSoon = rows.filter((l) => {
    if (!l.expiry_date || l.status === 'Expired') return false;
    const days = (new Date(l.expiry_date) - new Date(today())) / 86400000;
    return days <= 60;
  }).length;

  return (
    <div className="module-page">
      <h2>Lots</h2>
      <p>Each supplier delivery of a chemical, with its lot number, received and expiry dates, and where it is held.</p>

      <div className="cards small">
        <div className="card">
          <div className="card-label">Lots</div>
          <div className="card-value">{num(rows.length)}</div>
        </div>
        <div className="card card-amber">
          <div className="card-label">Expiring Within 60 Days</div>
          <div className="card-value">{num(expiringSoon)}</div>
        </div>
        <div className="card card-red">
          <div className="card-label">Expired</div>
          <div className="card-value">{num(expired)}</div>
        </div>
      </div>

      <div className="panel">
        <h3>{editing ? 'Edit Lot ' + editing : 'New Lot'}</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <input placeholder="Lot Number" value={form.lot_no} onChange={set('lot_no')} required />
          <select value={form.product_id} onChange={set('product_id')} required disabled={locked}>
            <option value="">Chemical…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <input placeholder="Supplier" value={form.supplier} onChange={set('supplier')} required disabled={locked} />
          <input type="date" value={form.received_date} onChange={set('received_date')} required disabled={locked} />
          <input type="date" value={form.expiry_date} onChange={set('expiry_date')} />
          <input
            type="number"
            step="any"
            min="0"
            placeholder="Quantity"
            value={form.quantity}
            onChange={set('quantity')}
            required
          />
          <select value={form.status} onChange={set('status')}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={form.warehouse} onChange={set('warehouse')}>
            {WAREHOUSES.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
          <select value={form.linked_order_id} onChange={set('linked_order_id')} disabled={locked}>
            <option value="">Link to order (optional)</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_no} · {o.customer_name}
              </option>
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
        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
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
              <th>Lot No</th>
              <th>Chemical</th>
              <th>Supplier</th>
              <th>Received</th>
              <th>Expiry</th>
              <th>Quantity</th>
              <th>Place</th>
              <th>Status</th>
              <th>Order</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className={l.status === 'Expired' ? 'row-low' : ''}>
                <td>{l.lot_no}</td>
                <td>
                  {l.product_code} · {l.product_name}
                </td>
                <td>{l.supplier || DASH}</td>
                <td>{dateLabel(l.received_date)}</td>
                <td>{l.expiry_date ? dateLabel(l.expiry_date) : DASH}</td>
                <td>
                  {qty(l.quantity)} {l.unit || ''}
                </td>
                <td>{l.warehouse || DASH}</td>
                <td>
                  <span className={'tag ' + tagFor(l.status)}>{l.status}</span>
                </td>
                <td>
                  {l.linked_order_no ? l.linked_order_no : DASH}
                  {l.linked_customer_name ? (
                    <>
                      <br />
                      <span className="strip-note">{l.linked_customer_name}</span>
                    </>
                  ) : null}
                </td>
                <td className="row-actions">
                  {l.status !== 'Expired' && (
                    <button className="link" onClick={() => advance(l)} title="Move to the next status">
                      Advance
                    </button>
                  )}
                  <button className="link" onClick={() => startEdit(l)}>
                    Edit
                  </button>
                  <button className="link danger" onClick={() => remove(l)}>
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
