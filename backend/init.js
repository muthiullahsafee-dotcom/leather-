const db = require('./db');

// Postgres schema — same tables and field names as the original SQLite build.
// INTEGER PRIMARY KEY -> SERIAL PRIMARY KEY; dates stay TEXT to preserve exact
// display/formatting behaviour (substr(entry_date, ...) etc.) exactly as before.
// Money columns use NUMERIC so accounting values are exact (cast back to JS numbers
// by the type parsers registered in db.js).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id                SERIAL PRIMARY KEY,
  code              TEXT,
  name              TEXT,
  price             NUMERIC(12,2),
  sizes_available   TEXT,
  sole_type         TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id                SERIAL PRIMARY KEY,
  name              TEXT,
  phone             TEXT,
  location          TEXT,
  customer_type     TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id                    SERIAL PRIMARY KEY,
  customer_id           INTEGER REFERENCES customers(id),
  order_type            TEXT,
  order_date            TEXT,
  status                TEXT,
  payment_status        TEXT,
  total_amount          NUMERIC(12,2),
  is_export             INTEGER,
  export_country        TEXT,
  shipment_date         TEXT,
  shipping_method       TEXT,
  tracking_ref          TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id                SERIAL PRIMARY KEY,
  order_id          INTEGER REFERENCES orders(id),
  product_id        INTEGER REFERENCES products(id),
  size              TEXT,
  quantity          INTEGER,
  unit_price        NUMERIC(12,2),
  unit_cost         NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS batches (
  id                        SERIAL PRIMARY KEY,
  batch_code                TEXT,
  product_id                INTEGER REFERENCES products(id),
  quantity                  INTEGER,
  start_date                TEXT,
  expected_completion_date  TEXT,
  stage                     TEXT,
  linked_order_id           INTEGER REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS stock_items (
  id                    SERIAL PRIMARY KEY,
  item_name             TEXT,
  item_type             TEXT,
  product_id            INTEGER REFERENCES products(id),
  size                  TEXT,
  quantity              INTEGER,
  unit                  TEXT,
  reorder_threshold     INTEGER
);

CREATE TABLE IF NOT EXISTS quality_checks (
  id                SERIAL PRIMARY KEY,
  batch_id          INTEGER REFERENCES batches(id),
  grade             TEXT,
  inspector_name    TEXT,
  inspection_date   TEXT,
  pass_fail         TEXT,
  notes             TEXT
);

CREATE TABLE IF NOT EXISTS income_expenses (
  id            SERIAL PRIMARY KEY,
  entry_date    TEXT,
  type          TEXT,
  category      TEXT,
  amount        NUMERIC(12,2),
  note          TEXT
);
`;

async function init() {
  await db.pool.query(SCHEMA);
}

module.exports = { init };

if (require.main === module) {
  init()
    .then(async () => {
      const tables = await db.all(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
      );
      console.log('Tables created:', tables.map((t) => t.table_name).join(', '));
      process.exit(0);
    })
    .catch((e) => {
      console.error('INIT ERROR:', e.message);
      process.exit(1);
    });
}