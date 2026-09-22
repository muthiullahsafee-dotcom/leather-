// Postgres database layer (node-postgres).
// Connection config comes exclusively from DATABASE_URL — never hardcoded.
//
// ASSUMPTION-NEEDED: SSL is enabled with relaxed certificate validation
// (rejectUnauthorized: false) to match common Supabase direct-host practice, where the
// server certificate chain isn't in Node's default trust store. Pin the exact CA
// (rejectUnauthorized: true with ca) before production use. Set PG_SSL=false to disable
// TLS entirely for a local Postgres without SSL.
const pg = require('pg');

// int8 (bigint) and numeric are returned as strings by node-postgres; parse them so the
// rest of the app keeps receiving plain JS numbers exactly like SQLite did.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : parseInt(v, 10)));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : parseFloat(v)));

const raw = (process.env.DATABASE_URL || '').trim();
if (!raw) {
  throw new Error(
    'DATABASE_URL environment variable is required (e.g. a Supabase/Postgres connection string).'
  );
}

// Strip any sslmode=... from the URL — SSL policy is controlled explicitly below so the
// URL itself can stay the raw one pasted from the provider.
function withoutSslmode(url) {
  const i = url.indexOf('?');
  if (i === -1) return url;
  const base = url.slice(0, i);
  const parts = url.slice(i + 1).split('&').filter((p) => !p.startsWith('sslmode='));
  return parts.length ? base + '?' + parts.join('&') : base;
}

const useSSL = process.env.PG_SSL !== 'false';
const pool = new pg.Pool({
  connectionString: withoutSslmode(raw),
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

// Small async query helpers that mirror the shapes the routes expect.
async function all(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

async function get(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows[0] || null;
}

async function run(sql, params = []) {
  const r = await pool.query(sql, params);
  return { lastId: r.rows.length ? r.rows[0].id : null, changes: r.rowCount, rows: r.rows };
}

// Run a callback inside a real Postgres transaction. The callback receives a scoped
// executor (get/all/run) bound to the same client so BEGIN/COMMIT wrap every statement.
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const scoped = {
      get: async (sql, params = []) => (await client.query(sql, params)).rows[0] || null,
      all: async (sql, params = []) => (await client.query(sql, params)).rows,
      run: async (sql, params = []) => {
        const r = await client.query(sql, params);
        return { lastId: r.rows.length ? r.rows[0].id : null, changes: r.rowCount, rows: r.rows };
      }
    };
    const out = await fn(scoped);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (x) {}
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, all, get, run, tx };