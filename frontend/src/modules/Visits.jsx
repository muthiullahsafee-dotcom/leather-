import { useEffect, useState } from 'react';
import { getList, post, put, del } from '../apiClient.js';
import { DASH, dateLabel, daysFromToday, today } from '../format.js';

const STATUSES = ['Open', 'Follow-up Due', 'Resolved'];

const empty = {
  customer_id: '',
  visit_date: today(),
  engineer: '',
  issue: '',
  solution_given: '',
  follow_up_date: '',
  status: 'Open'
};

const cardClass = (s) => (s === 'Resolved' ? 'visit-card status-resolved' : s === 'Follow-up Due' ? 'visit-card status-followup' : 'visit-card status-open');

export default function Visits() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    getList('/api/technical-visits' + (statusFilter ? '?status=' + encodeURIComponent(statusFilter) : ''))
      .then(setRows)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getList('/api/customers').then(setCustomers).catch(() => {});
  }, []);

  useEffect(load, [statusFilter]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    const payload = {
      customer_id: Number(form.customer_id),
      visit_date: form.visit_date,
      engineer: form.engineer,
      issue: form.issue,
      solution_given: form.solution_given || null,
      follow_up_date: form.follow_up_date || null,
      status: form.status
    };
    const call = editing ? put('/api/technical-visits/' + editing, payload) : post('/api/technical-visits', payload);
    call
      .then(() => {
        setForm(empty);
        setEditing(null);
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const startEdit = (v) => {
    setEditing(v.id);
    setForm({
      customer_id: String(v.customer_id),
      visit_date: v.visit_date,
      engineer: v.engineer,
      issue: v.issue,
      solution_given: v.solution_given || '',
      follow_up_date: v.follow_up_date || '',
      status: v.status
    });
    setErr('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setStatus = (v, status) => {
    setErr('');
    put('/api/technical-visits/' + v.id, { status })
      .then(load)
      .catch((e) => setErr(e.message));
  };

  const remove = (v) => {
    if (!window.confirm('Delete the visit to ' + v.customer_name + ' on ' + v.visit_date + '?')) return;
    del('/api/technical-visits/' + v.id)
      .then(load)
      .catch((e) => setErr(e.message));
  };

  const open = rows.filter((v) => v.status !== 'Resolved').length;
  const followUps = rows.filter((v) => v.status === 'Follow-up Due').length;
  const overdueFollowUps = rows.filter(
    (v) => v.follow_up_date && v.status !== 'Resolved' && daysFromToday(v.follow_up_date) < 0
  ).length;

  return (
    <div className="module-page">
      <h2>Technical Visits</h2>
      <p>Consultant visits to the tannery floor: the process problem found, what was advised, and the follow-up still owed.</p>

      <div className="cards small">
        <div className="card card-amber">
          <div className="card-label">Open Visits</div>
          <div className="card-value">{open}</div>
        </div>
        <div className="card card-red">
          <div className="card-label">Follow-up Due</div>
          <div className="card-value">{followUps}</div>
        </div>
        <div className="card card-red">
          <div className="card-label">Follow-ups Past Due</div>
          <div className="card-value">{overdueFollowUps}</div>
        </div>
      </div>

      <div className="panel">
        <h3>{editing ? 'Edit Visit' : 'Log a Visit'}</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <select value={form.customer_id} onChange={set('customer_id')} required>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="date" value={form.visit_date} onChange={set('visit_date')} required />
          <input placeholder="Engineer / Consultant" value={form.engineer} onChange={set('engineer')} required />
          <input
            className="full"
            placeholder="Issue observed (e.g. Shade variation in wet-blue drums)"
            value={form.issue}
            onChange={set('issue')}
            required
          />
          <input
            className="full"
            placeholder="Solution given (e.g. Reduce chrome addition by 0.2% and re-run trial lot)"
            value={form.solution_given}
            onChange={set('solution_given')}
          />
          <input type="date" value={form.follow_up_date} onChange={set('follow_up_date')} />
          <select value={form.status} onChange={set('status')}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button type="submit" className="btn">
            {editing ? 'Save' : 'Add Visit'}
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
      ) : rows.length === 0 ? (
        <p className="empty">No visits logged yet.</p>
      ) : (
        <div className="visit-grid">
          {rows.map((v) => {
            const overdue = v.follow_up_date && v.status !== 'Resolved' && daysFromToday(v.follow_up_date) < 0;
            return (
              <div key={v.id} className={cardClass(v.status)}>
                <div className="visit-top">
                  <div>
                    <div className="visit-customer">{v.customer_name}</div>
                    <div className="visit-meta">
                      {v.customer_location || DASH} · {dateLabel(v.visit_date)} · {v.engineer}
                    </div>
                  </div>
                  <span className={'tag ' + (v.status === 'Resolved' ? 'tag-green' : v.status === 'Follow-up Due' ? 'tag-amber' : 'tag-blue')}>
                    {v.status}
                  </span>
                </div>

                <div className="visit-issue">{v.issue}</div>
                {v.solution_given && <div className="visit-solution">{v.solution_given}</div>}

                <div className="visit-actions">
                  <select value={v.status} onChange={(e) => setStatus(v, e.target.value)}>
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  {v.follow_up_date ? (
                    <span className={'tag ' + (overdue ? 'tag-red' : 'tag-gray')}>
                      Follow-up {dateLabel(v.follow_up_date)}
                      {overdue ? ' (past due)' : ''}
                    </span>
                  ) : (
                    <span className="strip-note">No follow-up set</span>
                  )}
                  <button className="link" onClick={() => startEdit(v)}>
                    Edit
                  </button>
                  <button className="link danger" onClick={() => remove(v)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
