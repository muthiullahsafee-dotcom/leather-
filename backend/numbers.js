// Running document numbers (SO-/QTN-/INV-2026-0001) in one place, so a new row
// always continues the series for the current financial year.
async function nextDocNo(exec, prefix, table, column) {
  const year = new Date().getFullYear();
  const row = await exec.get(
    `SELECT ${column} AS no FROM ${table} WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`,
    [`${prefix}-${year}-%`]
  );
  const last = row ? parseInt(String(row.no).split('-').pop(), 10) : 0;
  return `${prefix}-${year}-${String(last + 1).padStart(4, '0')}`;
}

// Indian financial year: 1 April to 31 March, written 2026-27.
// GST invoices carry this form (ST/2026-27/0001) because the tax year, not the
// calendar year, is what a tax invoice has to be numbered within.
function financialYear(date = new Date()) {
  const y = date.getFullYear();
  // Months are 0-indexed, so April is 3. Before April the year belongs to the FY that started last year.
  const startYear = date.getMonth() >= 3 ? y : y - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

// Same idea as nextDocNo but for the slash-separated FY series. The sequence is the
// digits after the final '/', so ST/2026-27/0001 continues at ST/2026-27/0002.
async function nextFyDocNo(exec, prefix, table, column) {
  const fy = financialYear();
  const row = await exec.get(
    `SELECT ${column} AS no FROM ${table} WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`,
    [`${prefix}/${fy}/%`]
  );
  const last = row ? parseInt(String(row.no).split('/').pop(), 10) : 0;
  return `${prefix}/${fy}/${String(last + 1).padStart(4, '0')}`;
}

module.exports = { nextDocNo, nextFyDocNo, financialYear };
