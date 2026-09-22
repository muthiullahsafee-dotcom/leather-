import { useEffect, useState } from 'react';
import { API_BASE } from '../api.js';

const GRADES = ['Export Grade', 'Local Grade A', 'Local Grade B'];
const today = () => new Date().toISOString().slice(0, 10);
const empty = { batch_id: '', grade: 'Local Grade A', inspector_name: '', inspection_date: today(), pass_fail: 'Pass', notes: '' };

export default function Quality() {
  const [rows, setRows] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gradeFilter, setGradeFilter] = useState('');
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    fetch(API_BASE + '/api/quality-checks' + (gradeFilter ? '?grade=' + encodeURIComponent(gradeFilter) : ''))
      .then((r) => r.json())
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch(API_BASE + '/api/batches').then((r) => r.json()).then(setBatches).catch(() => {});
  }, []);

  useEffect(load, [gradeFilter]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    fetch(API_BASE + '/api/quality-checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, batch_id: Number(form.batch_id) })
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Request failed');
        setForm(empty);
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  const remove = (q) => {
    if (!window.confirm('Delete this quality check?')) return;
    fetch(API_BASE + '/api/quality-checks/' + q.id, { method: 'DELETE' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Delete failed');
        load();
      })
      .catch((ex) => setErr(ex.message));
  };

  return (
    <div className="module-page">
      <h2>Quality Checks</h2>
      <p>Inspection results and grading per production batch.</p>
      <div className="panel">
        <h3>New Quality Check</h3>
        {err && <div className="flash">{err}</div>}
        <form className="form-grid" onSubmit={submit}>
          <select value={form.batch_id} onChange={set('batch_id')} required>
            <option value="">Batch…</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.batch_code} · {b.product_code}</option>)}
          </select>
          <select value={form.grade} onChange={set('grade')}>
            {GRADES.map((g) => <option key={g}>{g}</option>)}
          </select>
          <input placeholder="Inspector Name" value={form.inspector_name} onChange={set('inspector_name')} required />
          <input type="date" value={form.inspection_date} onChange={set('inspection_date')} required />
          <select value={form.pass_fail} onChange={set('pass_fail')}>
            <option>Pass</option>
            <option>Fail</option>
          </select>
          <input placeholder="Notes" value={form.notes} onChange={set('notes')} />
          <button type="submit" className="btn">Add</button>
        </form>
      </div>

      <div className="strip">
        <label>Grade:
          <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
            <option value="">All</option>
            {GRADES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Batch</th><th>Product</th><th>Grade</th><th>Inspector</th><th>Date</th><th>Result</th><th>Notes</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id}>
                <td>{q.batch_code || '—'}</td>
                <td>{q.product_code || '—'}</td>
                <td>{q.grade}</td>
                <td>{q.inspector_name}</td>
                <td>{q.inspection_date}</td>
                <td>{q.pass_fail === 'Pass' ? <span className="tag tag-green">Pass</span> : <span className="tag tag-red">Fail</span>}</td>
                <td>{q.notes || '—'}</td>
                <td className="row-actions">
                  <button className="link danger" onClick={() => remove(q)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}