const db = require('./db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id                INTEGER PRIMARY KEY,
  code              TEXT,
  name              TEXT,
  price             REAL,
  sizes_available   TEXT,
  sole_type         TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id                INTEGER PRIMARY KEY,
  name              TEXT,
  phone             TEXT,
  location          TEXT,
  customer_type     TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id                    INTEGER PRIMARY KEY,
  customer_id           INTEGER REFERENCES customers(id),
  order_type            TEXT,
  order_date            TEXT,
  status                TEXT,
  payment_status        TEXT,
  total_amount          REAL,
  is_export             INTEGER,
  export_country        TEXT,
  shipment_date         TEXT,
  shipping_method       TEXT,
  tracking_ref          TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id                INTEGER PRIMARY KEY,
  order_id          INTEGER REFERENCES orders(id),
  product_id        INTEGER REFERENCES products(id),
  size              TEXT,
  quantity          INTEGER,
  unit_price        REAL,
  unit_cost         REAL
);

CREATE TABLE IF NOT EXISTS batches (
  id                        INTEGER PRIMARY KEY,
  batch_code                TEXT,
  product_id                INTEGER REFERENCES products(id),
  quantity                  INTEGER,
  start_date                TEXT,
  expected_completion_date  TEXT,
  stage                     TEXT,
  linked_order_id           INTEGER REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS stock_items (
  id                    INTEGER PRIMARY KEY,
  item_name             TEXT,
  item_type             TEXT,
  product_id            INTEGER REFERENCES products(id),
  size                  TEXT,
  quantity              INTEGER,
  unit                  TEXT,
  reorder_threshold     INTEGER
);

CREATE TABLE IF NOT EXISTS quality_checks (
  id                INTEGER PRIMARY KEY,
  batch_id          INTEGER REFERENCES batches(id),
  grade             TEXT,
  inspector_name    TEXT,
  inspection_date   TEXT,
  pass_fail         TEXT,
  notes             TEXT
);

CREATE TABLE IF NOT EXISTS income_expenses (
  id            INTEGER PRIMARY KEY,
  entry_date    TEXT,
  type          TEXT,
  category      TEXT,
  amount        REAL,
  note          TEXT
);
`;

function init() {
  db.exec(SCHEMA);
}

module.exports = { init };

if (require.main === module) {
  init();
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();
  console.log('Tables created:', tables.map((t) => t.name).join(', '));
}