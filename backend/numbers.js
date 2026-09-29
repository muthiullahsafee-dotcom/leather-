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

module.exports = { nextDocNo };
