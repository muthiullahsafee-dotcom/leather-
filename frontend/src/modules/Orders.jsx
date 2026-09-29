import { Fragment, useEffect, useState } from 'react';
import { get, getList, post, put, patch, del } from '../apiClient.js';
import { DASH, addDays, dateLabel, inr2, today } from '../format.js';
import LineItems, { blankItems, itemPayload, toItems } from '../LineItems.jsx';

const STATUSES = ['Pending Approval', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'];
const PAYMENTS = ['Unpaid', 'Partial', 'Paid'];
const SUPPLY_TYPES = ['Bulk', 'Retail'];

const blankForm = () => ({
  customer_id: '',
  supply_type: 'Bulk',
  order_date: today(),
  delivery_date: addDays(today(), 7),
  status: 'Pending Approval',
  payment_status: 'Unpaid',
  vehicle_number: '',
  items: blankItems()
});

const payTag = (p) => (p === 'Paid' ? 'tag-green' : p === 'Partial' ? 'tag-amber' : 'tag-gray');

export default function Orders({ onNavigate }) {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [supplyFilter, setSupplyFilter] = useState('');
  const [form, setForm] = useState(blankForm());
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (supplyFilter) params.set('supply_type', supplyFilter);
    getList('/api/orders' + (params.toString() ? '?' + params.toString() : ''))
      .then(setRows)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getList('/api/customers').then(setCustomers).catch(() => {});
    getList('/api/products').then(setProducts).catch(() => {});
  }, []);

  useEffect(load, [statusFilter, supplyFilter]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    setNote('');
    const payload = {
      customer_id: Number(form.customer_id),
      supply_type: form.supply_type,
      order_date: form.order_date,
      status: form.status,
      payment_status: form.payment_status,
      delivery_date: form.delivery_date || null,
      vehicle_number: form.vehicle_number || null,
      items: itemPayload(form.items)
    };
    const request = editing ? put('/api/orders/' + editing, payload) : post('/api/orders', payload);
    request
      .then((saved) => {
        setForm(blankForm());
        setEditing(null);
        load();
        setNote('Order ' + saved.order_no + ' saved.');
      })
      .catch((ex) => setErr(ex.message));
  };

  const startEdit = (o) => {
    get('/api/orders/' + o.id)
      .then((d) => {
        setEditing(d.id);
        setForm({
          customer_id: String(d.customer_id),
          supply_type: d.supply_type,
          order_date: d.order_date,
          delivery_date: d.delivery_date || '',
          status: d.status,
          payment_status: d.payment_status,
          vehicle_number: d.vehicle_number || '',
          items: toItems(d.items)
        });
        setErr('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch((e) => setErr(e.message));
  };

  const patchOrder = (id, path, body, message) => {
    setErr('');
    patch('/api/orders/' + id + '/' + path, body)
      .then(() => {
        if (message) setNote(message);
        load();
        if (openId === id) fetchDetail(id);
      })
      .catch((e) => setErr(e.message));
  };

  const fetchDetail = (id) => {
    get('/api/orders/' + id)
      .then(setDetail)
      .catch((e) => setErr(e.message));
  };

  const toggleDetail = (id) => {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    fetchDetail(id);
  };

  // Raising the invoice reduces stock and creates the receivable, so it is confirmed
  // and never done from an accidental double-click.
  const createInvoice = (o) => {
    if (!window.confirm('Create a GST invoice for order ' + o.order_no + '?')) return;
    setErr('');
    setNote('');
    post('/api/invoices', { order_id: o.id })
      .then((inv) => {
        setNote('Invoice ' + inv.invoice_no + ' created. Opening Invoices…');
        load();
        if (onNavigate) onNavigate('invoices');
      })
      .catch((e) => setErr(e.message));
  };

  const remove = (o) => {
    if (!window.confirm('Delete order ' + o.order_no + '?')) return;
    del('/api/orders/' + o.id)
      .then(load)
      .catch((e) => setErr(e.message));
  };

  const awaiting = rows.filter((o) => o.status === 'Pending Approval');
  const toInvoice = rows.filter((o) => !o.invoice_no && o.status !== 'Cancelled');
  const orderValue = rows.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  return (
    <div className="module-page">
      <h2>Orders</h2>
      <p>Sales orders for bulk and retail supply, from approval through dispatch to delivery.</p>

      <div className="cards small">
        <div className="card card-blue">
          <div className="card-label">Pending Approval</div>
          <div className="card-value">{awaiting.length}</div>
        </div>
        <div className="card card-amber">
          <div className="card-label">Not Yet Invoiced</div>
          <div className="card-value">{toInvoice.length}</div>
        </div>
        <div className="card card-green">
          <div className="card-label">Value (filtered)</div>
          <div className="card-value">{inr2(orderValue)}</div>
        </div>
      </div>

      <div className="panel">
        <h3>{editing ? 'Edit Order ' + editing : 'New Order'}</h3>
        {err && <div className="flash">{err}</div>}
        {note && <div className="flash ok">{note}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <select value={form.customer_id} onChange={set('customer_id')} required>
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={form.supply_type} onChange={set('supply_type')}>
              {SUPPLY_TYPES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <input type="date" value={form.order_date} onChange={set('order_date')} required />
            <input type="date" value={form.delivery_date} onChange={set('delivery_date')} />
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={form.payment_status} onChange={set('payment_status')}>
              {PAYMENTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <input placeholder="Vehicle Number" value={form.vehicle_number} onChange={set('vehicle_number')} />
          </div>

          <LineItems items={form.items} setItems={(items) => setForm({ ...form, items })} products={products} />

          <div className="form-actions">
            <button type="submit" className="btn">
              {editing ? 'Save Order' : 'Create Order'}
            </button>
            {editing && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setEditing(null);
                  setForm(blankForm());
                }}
              >
                Cancel
              </button>
            )}
          </div>
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
        <label>
          Supply
          <select value={supplyFilter} onChange={(e) => setSupplyFilter(e.target.value)}>
            <option value="">All</option>
            {SUPPLY_TYPES.map((s) => (
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
              <th>Order No</th>
              <th>Customer</th>
              <th>Supply</th>
              <th>Date</th>
              <th>Delivery</th>
              <th>Lines</th>
              <th>Value</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Invoice</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <Fragment key={o.id}>
                <tr>
                  <td>{o.order_no}</td>
                  <td>{o.customer_name}</td>
                  <td>{o.supply_type}</td>
                  <td>{dateLabel(o.order_date)}</td>
                  <td>{o.delivery_date ? dateLabel(o.delivery_date) : DASH}</td>
                  <td>{o.item_count}</td>
                  <td>{inr2(o.total_amount)}</td>
                  <td>
                    <select
                      value={o.status}
                      onChange={(e) => patchOrder(o.id, 'status', { status: e.target.value })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={'tag ' + payTag(o.payment_status)}>{o.payment_status}</span>
                  </td>
                  <td>{o.invoice_no || DASH}</td>
                  <td className="row-actions">
                    <button className="link" onClick={() => toggleDetail(o.id)}>
                      {openId === o.id ? 'Hide' : 'Items'}
                    </button>
                    {!o.invoice_no && o.status !== 'Cancelled' && (
                      <button className="link" onClick={() => createInvoice(o)} title="Create a GST invoice from this order">
                        Create Invoice
                      </button>
                    )}
                    <button className="link" onClick={() => startEdit(o)}>
                      Edit
                    </button>
                    <button className="link danger" onClick={() => remove(o)}>
                      Delete
                    </button>
                  </td>
                </tr>
                {openId === o.id && (
                  <tr>
                    <td colSpan="11" className="detail-cell">
                      {!detail ? (
                        'Loading…'
                      ) : (
                        <>
                          {detail.vehicle_number && (
                            <div className="detail-meta">Vehicle: {detail.vehicle_number}</div>
                          )}
                          <table className="table inner">
                            <thead>
                              <tr>
                                <th>Code</th>
                                <th>Chemical</th>
                                <th>HSN</th>
                                <th>Qty</th>
                                <th>Unit</th>
                                <th>Rate</th>
                                <th>Cost</th>
                                <th>Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.items.map((it) => (
                                <tr key={it.id}>
                                  <td>{it.product_code}</td>
                                  <td>{it.product_name}</td>
                                  <td>{it.hsn_code || DASH}</td>
                                  <td>{it.quantity}</td>
                                  <td>{it.unit || DASH}</td>
                                  <td>{inr2(it.unit_price)}</td>
                                  <td>{inr2(it.unit_cost)}</td>
                                  <td>{inr2(Number(it.unit_price) * Number(it.quantity))}</td>
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
