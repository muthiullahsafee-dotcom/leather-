const BASE = 'http://localhost:3001';
let pass = 0;
let fail = 0;
const check = (name, cond, extra) => {
  if (cond) {
    pass += 1;
    console.log('PASS  ' + name);
  } else {
    fail += 1;
    console.log('FAIL  ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  }
};
const api = async (method, p, body) => {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(BASE + p, opt);
  let j = null;
  try {
    j = await r.json();
  } catch (e) {}
  return { status: r.status, json: j };
};

(async () => {
  // Step 6: Batches
  let r = await api('GET', '/api/batches');
  check('batches list -> 200 + 3 rows', r.status === 200 && r.json.length === 3, r);
  const b3 = r.json.find((b) => b.batch_code === 'LS3-2026-B03');
  check('batch 3 in Packed stage', b3 && b3.stage === 'Packed', b3opera);

  r = await api('GET', '/api/batches/1');
  check('batch 1 detail LS2 + Stitching + cost 955', r.status === 200 && r.json.product_code === 'LS2' && r.json.stage === 'Stitching' && r.json.unit_cost === 955, r.json);

  r = await api('POST', '/api/batches', { batch_code: 'B0000', product_id: 1, quantity: 50, stage: 'Cutting' });
  const createdB = r.json;
  check('POST batch -> 201 + id', r.status === 201 && Number.isInteger(createdB.id), r);

  r = await api('POST', '/api/batches/' + createdB.id + '/advance');
  check('advance Cutting -> Stitching', r.status === 200 && r.json.stage === 'Stitching', r.json);
  r = await api('POST', '/api/batches/' + createdB.id + '/advance');
  r = await api('POST', '/api/batches/' + createdB.id + '/advance');
  r = await api('POST', '/api/batches/' + createdB.id + '/advance');
  check('advance to Quality Check', r.status === 200 && r.json.stage === 'Quality Check', r.json);

  // Step 6: Quality
  r = await api('GET', '/api/quality-checks');
  check('quality list -> 200 + 2 rows', r.status === 200 && r.json.length === 2, r);
  r = await api('GET', '/api/quality-checks?grade=Export Grade');
  check('grade=Export Grade filter -> 1', r.status === 200 && r.json.length === 1, r);

  // Step 7: Ledger
  r = await api('GET', '/api/income-expenses');
  check('ledger -> 200 + 8 rows', r.status === 200 && r.json.length === 8, r);
  const inc = r.json.filter((e) => e.type === 'Income');
  const exp = r.json.filter((e) => e.type === 'Expense');
  const totalInc = inc.reduce((s, e) => s + e.amount, 0);
  const totalExp = exp.reduce((s, e) => s + e.amount, 0);
  check('income sum = 702000', totalInc === 702000, totalInc);
  check('expense sum = 344200', totalExp === 344200, totalExp);
  check('net profit = 357800', totalInc - totalExp === 357800, totalInc - totalExp);
  check('monthly note balance column present', r.json.every((e) => 'running_balance' in e), r.json.filter((e) => !('running_balance' in e)));

  r = await api('POST', '/api/income-expenses', { entry_date: '2026-09-20', type: 'Expense', category: 'Raw Material Purchase', amount: 40, note: 'x' });
  const lc = r.json;
  check('POST ledger -> 201 + id', r.status === 201 && Number.isInteger(lc.id), r74323);

  // Step 7: Reports
  r = await api('GET', '/api/reports/sales-over-time');
  check('sales-over-time -> >=2 points', r.status === 200 && r.json.length >= 2, r);
  const sep = r.json.find((x) => x.month === '2026-09');
  check('Sep 2026 sales = 290000', sep && sep.sales === 290000, sep);
  r = await api('GET', '/api/reports/profit-by-month');
  const sepP = r.json.find((x) => x.month === '2026-09');
  check('Sep 2026 profit = 149200', sepP && sepP.profit === 149200, sepP);
  r = await api('GET', '/api/reports/stock-by-style');
  const ls6 = r.json.find((x) => x.style === 'LS6');
  check('LS6 finished pairs = 6', ls6 && ls6.pairs === 6, ls6);
  r = await api('GET', '/api/reports/orders-by-status');
  check('orders-by-status -> 5 statuses', r.status === 200 && r.json.length >= 5, r);

  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('VERIFY ERROR: ' + e.message);
  process.exit(2);
});