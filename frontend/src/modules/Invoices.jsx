import { useEffect, useState } from 'react';
import { get, getList, post, del } from '../apiClient.js';
import { DASH, dateLabel, dueLabel, inr2, num, qty, today } from '../format.js';

const STATUSES = ['Paid', 'Partially Paid', 'Unpaid'];
const MODES = ['NEFT', 'RTGS', 'Cheque', 'Cash', 'UPI'];

// e-invoice and e-way bill are demo documents: they are generated locally with a
// clearly-labelled notice, so the UI says so rather than implying a portal call.
const DEMO_GST =
  'E-invoice IRN and e-way bill are generated locally for this demo. They are not registered on the GST portal.';

const statusTag = (s) => (s === 'Paid' ? 'tag-green' : s === 'Partially Paid' ? 'tag-amber' : 'tag-red');

export default function Invoices({ onNavigate }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [pay, setPay] = useState({ amount: '', mode: 'NEFT', payment_date: today(), note: '' });

  const load = () => {
    setLoading(true);
    getList('/api/invoices' + (statusFilter ? '?status=' + encodeURIComponent(statusFilter) : ''))
      .then(setRows)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter]);

  // Opening a different invoice replaces the payment draft, so an amount typed for one
  // invoice is never submitted against another.
  useEffect(() => {
    setPay({ amount: '', mode: 'NEFT', payment_date: today(), note: '' });
  }, [openId]);

  const refreshDetail = (id) => {
    get('/api/invoices/' + id)
      .then(setDetail)
      .catch((e) => setErr(e.message));
  };

  const toggleDetail = (id) => {
    setErr('');
    setNote('');
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    refreshDetail(id);
  };

  const recordPayment = (e) => {
    e.preventDefault();
    setErr('');
    setNote('');
    post('/api/invoices/' + openId + '/payments', {
      amount: Number(pay.amount),
      mode: pay.mode,
      payment_date: pay.payment_date,
      note: pay.note || null
    })
      .then((inv) => {
        setNote('Receipt of ' + inr2(pay.amount) + ' recorded against ' + inv.invoice_no + '.');
        setPay({ amount: '', mode: 'NEFT', payment_date: today(), note: '' });
        refreshDetail(inv.id);
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const mintGst = (path, label) => {
    setErr('');
    setNote('');
    post('/api/invoices/' + openId + '/' + path, {})
      .then((inv) => {
        setDetail(inv);
        setNote(label + ' generated for ' + inv.invoice_no + '. Demo only — not sent to the GST portal.');
      })
      .catch((e) => setErr(e.message));
  };

  const remove = (inv) => {
    if (!window.confirm('Delete invoice ' + inv.invoice_no + '?')) return;
    del('/api/invoices/' + inv.id)
      .then(() => {
        if (openId === inv.id) {
          setOpenId(null);
          setDetail(null);
        }
        load();
      })
      .catch((e) => setErr(e.message));
  };

  const billed = rows.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const outstanding = rows.reduce((s, i) => s + Number(i.amount_due || 0), 0);

  return (
    <div className="module-page">
      <h2>Invoices</h2>
      <p>GST tax invoices raised from sales orders, with the CGST/SGST or IGST split and the payment trail.</p>

      <div className="cards small">
        <div className="card">
          <div className="card-label">Invoices (filtered)</div>
          <div className="card-value">{num(rows.length)}</div>
        </div>
        <div className="card card-green">
          <div className="card-label">Billed Value</div>
          <div className="card-value">{inr2(billed)}</div>
        </div>
        <div className="card card-red">
          <div className="card-label">Outstanding</div>
          <div className="card-value">{inr2(outstanding)}</div>
        </div>
      </div>

      {err && <div className="flash">{err}</div>}
      {note && <div className="flash ok">{note}</div>}

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
        {statusFilter === '' && (
          <span className="strip-note">
            <button className="link" onClick={() => onNavigate && onNavigate('orders')}>
              No invoices yet? Raise one from an order →
            </button>
          </span>
        )}
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Invoice No</th>
              <th>Order</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Due</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>{i.invoice_no}</td>
                <td>{i.order_no || DASH}</td>
                <td>{i.customer_name}</td>
                <td>{dateLabel(i.invoice_date)}</td>
                <td>
                  {dateLabel(i.due_date)}
                  <br />
                  <span className={'tag ' + (Number(i.amount_due) > 0 && i.due_date < today() ? 'tag-red' : 'tag-gray')}>
                    {dueLabel(i.due_date)}
                  </span>
                </td>
                <td>{inr2(i.total_amount)}</td>
                <td>{inr2(i.amount_paid)}</td>
                <td>{inr2(i.amount_due)}</td>
                <td>
                  <span className={'tag ' + statusTag(i.status)}>{i.status}</span>
                </td>
                <td className="row-actions">
                  <button className="link" onClick={() => toggleDetail(i.id)}>
                    {openId === i.id ? 'Hide' : 'View'}
                  </button>
                  {Number(i.amount_paid) === 0 && (
                    <button className="link danger" onClick={() => remove(i)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {openId && detail && (
        <div className="panel invoice-doc">
          <h3>
            Tax Invoice {detail.invoice_no}
            <span className={'tag tag-spaced ' + statusTag(detail.status)}>{detail.status}</span>
          </h3>

          <div className="kv">
            <div className="kv-row">
              <span className="kv-key">Invoice Date</span>
              <span className="kv-val">{dateLabel(detail.invoice_date)}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Due Date</span>
              <span className="kv-val">
                {dateLabel(detail.due_date)} ({dueLabel(detail.due_date)})
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Order</span>
              <span className="kv-val">{detail.order_no || DASH}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Place of Supply</span>
              <span className="kv-val">{detail.place_of_supply || DASH}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Buyer</span>
              <span className="kv-val">
                {detail.customer_name}
                {detail.customer_location ? ' · ' + detail.customer_location : ''}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Buyer GSTIN</span>
              <span className="kv-val mono">{detail.buyer_gstin || DASH}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Seller GSTIN</span>
              <span className="kv-val mono">{detail.seller_gstin || DASH}</span>
            </div>
          </div>

          <table className="table inner">
            <thead>
              <tr>
                <th>HSN</th>
                <th>Description</th>
                <th>Unit</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Taxable Value</th>
                <th>GST</th>
                <th>Tax Amount</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.hsn_code || DASH}</td>
                  <td>{it.description}</td>
                  <td>{it.unit || DASH}</td>
                  <td>{qty(it.quantity)}</td>
                  <td>{inr2(it.rate)}</td>
                  <td>{inr2(it.taxable_value)}</td>
                  <td>{it.gst_rate}%</td>
                  <td>{inr2(it.tax_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="total-strip">
            <div className="total-line">
              <span>Taxable Value</span>
              <span>{inr2(detail.subtotal)}</span>
            </div>
            {Number(detail.cgst) > 0 && (
              <div className="total-line">
                <span>CGST</span>
                <span>{inr2(detail.cgst)}</span>
              </div>
            )}
            {Number(detail.sgst) > 0 && (
              <div className="total-line">
                <span>SGST</span>
                <span>{inr2(detail.sgst)}</span>
              </div>
            )}
            {Number(detail.igst) > 0 && (
              <div className="total-line">
                <span>IGST</span>
                <span>{inr2(detail.igst)}</span>
              </div>
            )}
            <div className="total-line grand">
              <span>Invoice Total</span>
              <span>{inr2(detail.total_amount)}</span>
            </div>
          </div>
          {detail.amount_in_words && <div className="words-line">{detail.amount_in_words}</div>}

          {(detail.irn || detail.eway_bill) && (
            <div className="kv mt-md">
              {detail.irn && (
                <div className="kv-row">
                  <span className="kv-key">IRN (demo)</span>
                  <span className="kv-val mono">{detail.irn}</span>
                </div>
              )}
              {detail.eway_bill && (
                <div className="kv-row">
                  <span className="kv-key">E-Way Bill (demo)</span>
                  <span className="kv-val mono">{detail.eway_bill}</span>
                </div>
              )}
            </div>
          )}

          <div className="form-actions mt-md">
            <button type="button" className="btn ghost" onClick={() => mintGst('e-invoice', 'E-invoice IRN')}>
              Generate E-Invoice
            </button>
            <button type="button" className="btn ghost" onClick={() => mintGst('e-way-bill', 'E-way bill')}>
              Generate E-Way Bill
            </button>
            <span className="strip-note">{DEMO_GST}</span>
          </div>

          <h4 className="sub-head">Payments</h4>
          {detail.payments.length === 0 ? (
            <p className="empty">No receipts recorded against this invoice yet.</p>
          ) : (
            <table className="table inner">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Mode</th>
                  <th>Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {detail.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{dateLabel(p.payment_date)}</td>
                    <td>{p.mode}</td>
                    <td>{inr2(p.amount)}</td>
                    <td>{p.note || DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {Number(detail.amount_due) > 0 ? (
            <form onSubmit={recordPayment}>
              <h4 className="sub-head">Record a Receipt</h4>
              <div className="form-grid">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Amount (₹)"
                  value={pay.amount}
                  onChange={(e) => setPay({ ...pay, amount: e.target.value })}
                  required
                />
                <select value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>
                  {MODES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={pay.payment_date}
                  onChange={(e) => setPay({ ...pay, payment_date: e.target.value })}
                  required
                />
                <input
                  placeholder="Note (e.g. NEFT ref)"
                  value={pay.note}
                  onChange={(e) => setPay({ ...pay, note: e.target.value })}
                />
                <button type="submit" className="btn">
                  Record {inr2(pay.amount || 0)}
                </button>
              </div>
            </form>
          ) : (
            <p className="empty">This invoice is fully paid — nothing outstanding.</p>
          )}
        </div>
      )}
    </div>
  );
}
