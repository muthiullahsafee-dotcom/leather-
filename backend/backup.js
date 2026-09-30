// Dumps every table in the database to backup/<folder>/ so a reseed can be undone.
//
// Why this exists rather than "just run pg_dump": the live database is a Render-managed
// or Supabase Postgres reached only through DATABASE_URL, and pg_dump/psql are not
// installed on the Render shell. node-postgres is, so the dump is taken through the
// same connection string the app uses, which also means the backup can only ever be
// produced by someone who can actually reach the live data.
//
// Two artefacts are written per run:
//   dump.sql    COPY-format data, restorable with psql into a database whose schema has
//               already been created by `npm run reseed` (which runs init() first)
//   tables.json the same rows as JSON, readable without Postgres
// plus manifest.json with per-table row counts.
//
// Restoring:  npm run reseed && psql "$DATABASE_URL" -f backup/<folder>/dump.sql
// Reading:     tables.json is enough to confirm what was there before the reseed.
//
// Run with:  npm run backup
const fs = require('fs');
const path = require('path');
const db = require('./db');

const OUT_ROOT = path.join(__dirname, '..', 'backup');

// Every table holding demo data, child-first. Matches the wipe order in seed.js, so a
// dump can be replayed in the reverse direction without tripping a foreign key.
const TABLES = [
  'invoice_payments',
  'invoice_items',
  'invoices',
  'quotation_items',
  'quotations',
  'technical_visits',
  'quality_checks',
  'lots',
  'stock_items',
  'order_items',
  'orders',
  'customers',
  'products',
  'income_expenses',
  'seller_profile'
];

// Postgres COPY text format escapes these inside a field. Tabs and newlines in a value
// would otherwise break the line-oriented format, so they have to be escaped.
function copyEscape(v) {
  if (v === null || v === undefined) return '\\N';
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// A COPY block is only valid if every row in it has the same column count, so the
// header comes from the table's real column list rather than from the first row's keys.
function columnsOf(rows, table) {
  if (rows.length) return Object.keys(rows[0]);
  throw new Error(`table ${table} returned no rows, so its column list is unknown`);
}

async function dump() {
  const stamp = new Date().toISOString().slice(0, 10);
  const folder = path.join(OUT_ROOT, `pre-reseed-${stamp}`);
  fs.mkdirSync(folder, { recursive: true });

  const sql = [];
  const counts = {};
  const json = {};
  let total = 0;

  for (const table of TABLES) {
    const exists = await db.get(
      `SELECT 1 AS ok FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1 AND table_type = 'BASE TABLE'`,
      [table]
    );
    if (!exists) {
      counts[table] = null;
      json[table] = { missing: true };
      continue;
    }

    const cols = (await db.all(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table]))
      .map((c) => c.column_name);

    const rows = await db.all(`SELECT ${cols.join(', ')} FROM ${table}`);
    counts[table] = rows.length;
    total += rows.length;
    json[table] = rows;

    sql.push(`-- ${table} (${rows.length} rows)`);
    sql.push(`COPY ${table} (${cols.join(', ')}) FROM stdin;`);
    for (const row of rows) {
      sql.push(cols.map((c) => copyEscape(row[c])).join('\t'));
    }
    sql.push('\\.');
    sql.push('');
  }

  fs.writeFileSync(path.join(folder, 'dump.sql'), sql.join('\n'), 'utf8');
  fs.writeFileSync(path.join(folder, 'tables.json'), JSON.stringify(json, null, 2), 'utf8');
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({
    taken_at: new Date().toISOString(),
    total_rows: total,
    row_counts: counts
  }, null, 2), 'utf8');

  return { folder, total, counts };
}

dump()
  .then(({ folder, total, counts }) => {
    console.log('Backup written to:', folder);
    console.log('Total rows:', total);
    console.log(JSON.stringify(counts, null, 2));
    return db.pool.end();
  })
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('BACKUP FAILED:', e.message);
    console.error('Do NOT reseed: there is no verified backup.');
    try { await db.pool.end(); } catch (x) {}
    process.exit(1);
  });
