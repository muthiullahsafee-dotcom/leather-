import { Fragment, useEffect, useState } from 'react';
import { get, getList, post, put, patch, del } from '../apiClient.js';
import { DASH, addDays, dateLabel, inr2, today } from '../format.js';
import LineItems, { blankItems, itemPayload, toItems } from '../LineItems.jsx';

const STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected'];

// A quotation is usually a 30-day offer, so the default validity is that far out.
const blankForm = () => ({
  customer_id: '',
  quote_date: today(),
  valid_until: addDays(today(), 30),
  status: 'Draft',
  notes: '',
  items: blankItems()
});

export default function Quotations({ onNavigate }) {
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
  const [note, setNote] = useState('');

  const load = () => {
    setLoading(true);
    getList('/api/quotations' + (statusFilter ? '?status=' + encodeURIComponent(statusFilter) : ''))
      .then(setRows)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getList('/api/customers').then(setCustomers).catch(() => {});
    getList('/api/products').then(setProducts).catch(() => {});
  }, []);

  useEffect(load, [statusFilter]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    setNote('');
    const payload = {
      customer_id: Number(form.customer_id),
      quote_date: form.quote_date,
      valid_until: form.valid_until || null,
      status: form.status,
      notes: form.notes || null,
      items: itemPayload(form.items)
    };
    const request = editing ? put('/api/quotations/' + editing, payload) : post('/api/quotations', payload);
    request
      .then(() => {
        setForm(blankForm());
        setEditing(null);
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const startEdit = (q) => {
    get('/api/quotations/' + q.id)
      .then((d) => {
        setEditing(d.id);
        setForm({
          customer_id: String(d.customer_id),
          quote_date: d.quote_date,
          valid_until: d.valid_until || '',
          status: d.status,
          notes: d.notes || '',
          items: toItems(d.items)
        });
        setErr('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch((e) => setErr(e.message));
  };

  const changeStatus = (q, status) => {
    setErr('');
    setNote('');
    patch('/api/quotations/' + q.id + '/status', { status })
      .then(load)
      .catch((e) => setErr(e.message));
  };

  const convert = (q) => {
    setErr('');
    setNote('');
    if (!window.confirm('Convert ' + q.quotation_no + ' into a sales order?')) return;
    post('/api/quotations/' + q.id + '/convert', {})
      .then((res) => {
        setNote(res.message + '. Opening Orders…');
        load();
        if (onNavigate) onNavigate('orders');
      })
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
    get('/api/quotations/' + id)
      .then(setDetail)
      .catch((e) => setErr(e.message));
  };

  const remove = (q) => {
    if (!window.confirm('Delete quotation ' + q.quotation_no + '?')) return;
    del('/api/quotations/' + q.id)
      .then(load)
      .catch((e) => setErr(e.message));
  };

  const pipeline = STATUSES.map((s) => ({
    status: s,
    count: rows.filter((r) => r.status === s).length,
    value: rows.filter((r) => r.status === s).reduce((sum, r) => sum + Number(r.total_amount || 0), 0)
  }));

  return (
    <div className="module-page">
      <h2>Quotations</h2>
      <p>Price offers to tanneries and leather merchants. An accepted quotation becomes a sales order in one click.</p>

      <div className="cards small">
        <div className="card">
          <div className="card-label">Open Pipeline</div>
          <div className="card-value">
            {rows.filter((r) => r.status === 'Draft' || r.status === 'Sent').length}
          </div>
        </div>
        <div className="card card-green">
          <div className="card-label">Accepted</div>
          <div className="card-value">{rows.filter((r) => r.status === 'Accepted').length}</div>
        </div>
        <div className="card card-blue">
          <div className="card-label">Pipeline Value</div>
          <div className="card-value">
            {inr2(
              rows
                .filter((r) => r.status === 'Draft' || r.status === 'Sent' || r.status === 'Accepted')
                .reduce((s, r) => s + Number(r.total_amount || 0), 0)
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>{editing ? 'Edit Quotation ' + editing : 'New Quotation'}</h3>
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
            <input type="date" value={form.quote_date} onChange={set('quote_date')} required />
            <input type="date" value={form.valid_until} onChange={set('valid_until')} />
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <input
            className="full"
            placeholder="Notes (e.g. 25 kg drums, delivery in 2 weeks)"
            value={form.notes}
            onChange={set('notes')}
          />

          <LineItems items={form.items} setItems={(items) => setForm({ ...form, items })} products={products} />

          <div className="form-actions">
            <button type="submit" className="btn">
              {editing ? 'Save Quotation' : 'Create Quotation'}
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
          Filter status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <span className="strip-note">
          {pipeline.map((p) => p.status + ' ' + p.count).join(' · ')}
        </span>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Quote No</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Valid Until</th>
              <th>Lines</th>
              <th>Value</th>
              <th>Status</th>
              <th>Order</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <Fragment key={q.id}>
                <tr>
                <td>{q.quotation_no}</td>
                <td>{q.customer_name}</td>
                <td>{dateLabel(q.quote_date)}</td>
                <td>{q.valid_until ? dateLabel(q.valid_until) : DASH}</td>
                <td>{q.item_count}</td>
                <td>{inr2(q.total_amount)}</td>
                <td>
                  <select value={q.status} onChange={(e) => changeStatus(q, e.target.value)}>
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td>{q.converted_order_no || DASH}</td>
                <td className="row-actions">
                  <button className="link" onClick={() => toggleDetail(q.id)}>
                    {openId === q.id ? 'Hide' : 'Items'}
                  </button>
                  {q.converted_order_id ? (
                    <span className="tag tag-green">Converted</span>
                  ) : (
                    <>
                      <button
                        className="link"
                        onClick={() => convert(q)}
                        disabled={q.status !== 'Sent' && q.status !== 'Accepted'}
                        title={
                          q.status !== 'Sent' && q.status !== 'Accepted'
                            ? 'Mark the quotation as Sent or Accepted first'
                            : 'Convert to a sales order'
                        }
                      >
                        Convert
                      </button>
                      <button className="link" onClick={() => startEdit(q)}>
                        Edit
                      </button>
                    </>
                  )}
                  <button className="link danger" onClick={() => remove(q)}>
                    Delete
                  </button>
                </td>
                </tr>
                {openId === q.id && (
                  <tr>
                    <td colSpan="9" className="detail-cell">
                    {!detail ? (
                      'Loading…'
                    ) : (
                      <>
                        {detail.notes && <div className="detail-meta">{detail.notes}</div>}
                        <table className="table inner">
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>Chemical</th>
                              <th>HSN</th>
                              <th>Qty</th>
                              <th>Unit</th>
                              <th>Rate</th>
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
