const db = require('./db');

// Postgres schema for Surya Tech — a leather chemicals wholesaler and technical
// consultant in Vaniyambadi, Tamil Nadu.
//
// This file is the project's only migration mechanism: `init()` runs
//   1. ALTER steps   (upgrade a database created by an earlier version of the demo)
//   2. CREATE TABLE  (fresh database)
//   3. ALTER steps   (columns that reference tables created in step 2)
// Every statement is idempotent, so booting the server, seeding and resetting all
// converge on the same schema.
//
// Dates stay TEXT (YYYY-MM-DD) to keep the exact display/ordering behaviour the
// reporting queries rely on (substr(order_date, 1, 7) etc.).
// Money columns use NUMERIC so accounting values are exact (db.js parses them back
// into plain JS numbers).

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id                SERIAL PRIMARY KEY,
  code              TEXT,
  name              TEXT,
  hsn_code          TEXT,
  unit              TEXT,
  brand             TEXT,
  purchase_price    NUMERIC(12,2),
  selling_price     NUMERIC(12,2),
  gst_rate          NUMERIC(5,2),
  reorder_level     INTEGER
);

CREATE TABLE IF NOT EXISTS customers (
  id                SERIAL PRIMARY KEY,
  name              TEXT,
  phone             TEXT,
  location          TEXT,
  customer_type     TEXT,
  gstin             TEXT,
  state_code        TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id                SERIAL PRIMARY KEY,
  order_no          TEXT,
  customer_id       INTEGER REFERENCES customers(id),
  supply_type       TEXT,
  order_date        TEXT,
  status            TEXT,
  payment_status    TEXT,
  total_amount      NUMERIC(12,2),
  delivery_date     TEXT,
  vehicle_number    TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id                SERIAL PRIMARY KEY,
  order_id          INTEGER REFERENCES orders(id),
  product_id        INTEGER REFERENCES products(id),
  quantity          NUMERIC(12,2),
  unit_price        NUMERIC(12,2),
  unit_cost         NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS quotations (
  id                SERIAL PRIMARY KEY,
  quotation_no      TEXT,
  customer_id       INTEGER REFERENCES customers(id),
  quote_date        TEXT,
  valid_until       TEXT,
  status            TEXT,
  total_amount      NUMERIC(12,2),
  notes             TEXT,
  converted_order_id INTEGER REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id                SERIAL PRIMARY KEY,
  quotation_id      INTEGER REFERENCES quotations(id),
  product_id        INTEGER REFERENCES products(id),
  quantity          NUMERIC(12,2),
  unit_price        NUMERIC(12,2),
  unit_cost         NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS invoices (
  id                 SERIAL PRIMARY KEY,
  invoice_no         TEXT,
  order_id           INTEGER REFERENCES orders(id),
  customer_id        INTEGER REFERENCES customers(id),
  invoice_date       TEXT,
  due_date           TEXT,
  status             TEXT,
  place_of_supply    TEXT,
  seller_gstin       TEXT,
  buyer_gstin        TEXT,
  subtotal           NUMERIC(12,2),
  cgst               NUMERIC(12,2),
  sgst               NUMERIC(12,2),
  igst               NUMERIC(12,2),
  total_amount       NUMERIC(12,2),
  amount_paid        NUMERIC(12,2),
  amount_due         NUMERIC(12,2),
  amount_in_words    TEXT,
  irn                TEXT,
  irn_generated_at   TEXT,
  eway_bill          TEXT,
  eway_generated_at  TEXT
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id                SERIAL PRIMARY KEY,
  invoice_id        INTEGER REFERENCES invoices(id),
  product_id        INTEGER REFERENCES products(id),
  hsn_code          TEXT,
  description       TEXT,
  unit              TEXT,
  quantity          NUMERIC(12,2),
  rate              NUMERIC(12,2),
  taxable_value     NUMERIC(12,2),
  gst_rate          NUMERIC(5,2),
  tax_amount        NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id                SERIAL PRIMARY KEY,
  invoice_id        INTEGER REFERENCES invoices(id),
  payment_date      TEXT,
  amount            NUMERIC(12,2),
  mode              TEXT,
  note              TEXT
);

CREATE TABLE IF NOT EXISTS stock_items (
  id                SERIAL PRIMARY KEY,
  product_id        INTEGER REFERENCES products(id),
  item_name         TEXT,
  quantity          NUMERIC(12,2),
  unit              TEXT,
  warehouse         TEXT
);

CREATE TABLE IF NOT EXISTS lots (
  id                SERIAL PRIMARY KEY,
  lot_no            TEXT,
  product_id        INTEGER REFERENCES products(id),
  supplier          TEXT,
  received_date     TEXT,
  expiry_date       TEXT,
  quantity          NUMERIC(12,2),
  status            TEXT,
  warehouse         TEXT,
  linked_order_id   INTEGER REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS quality_checks (
  id                SERIAL PRIMARY KEY,
  lot_id            INTEGER REFERENCES lots(id),
  grade             TEXT,
  inspector_name    TEXT,
  inspection_date   TEXT,
  pass_fail         TEXT,
  notes             TEXT
);

CREATE TABLE IF NOT EXISTS technical_visits (
  id                SERIAL PRIMARY KEY,
  customer_id       INTEGER REFERENCES customers(id),
  visit_date        TEXT,
  engineer          TEXT,
  issue             TEXT,
  solution_given    TEXT,
  follow_up_date    TEXT,
  status            TEXT
);

CREATE TABLE IF NOT EXISTS income_expenses (
  id                SERIAL PRIMARY KEY,
  entry_date        TEXT,
  type              TEXT,
  category          TEXT,
  amount            NUMERIC(12,2),
  note              TEXT,
  invoice_id        INTEGER REFERENCES invoices(id)
);

CREATE TABLE IF NOT EXISTS seller_profile (
  id                SERIAL PRIMARY KEY,
  business_name     TEXT,
  address           TEXT,
  city              TEXT,
  district          TEXT,
  state             TEXT,
  state_code        TEXT,
  gstin             TEXT,
  phone             TEXT,
  email             TEXT,
  is_sample         INTEGER
);
`;

// Upgrade steps that only touch tables an older version of the demo already created.
// Kept before the CREATE TABLE block so a renamed table is not shadowed by a new
// empty one of the same name.
const UPGRADE_BEFORE = `
-- Products were footwear styles (code, name, price, sizes_available, sole_type).
ALTER TABLE products RENAME COLUMN sizes_available TO hsn_code;
ALTER TABLE products RENAME COLUMN sole_type TO unit;
ALTER TABLE products RENAME COLUMN price TO selling_price;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_level INTEGER;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state_code TEXT;

-- Orders were export shipments; they are domestic lorry deliveries now.
ALTER TABLE orders RENAME COLUMN order_type TO supply_type;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_no TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supply_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_number TEXT;
ALTER TABLE orders DROP COLUMN IF EXISTS is_export;
ALTER TABLE orders DROP COLUMN IF EXISTS export_country;
ALTER TABLE orders DROP COLUMN IF EXISTS shipment_date;
ALTER TABLE orders DROP COLUMN IF EXISTS shipping_method;
ALTER TABLE orders DROP COLUMN IF EXISTS tracking_ref;

-- Chemical quantities are weighed/filled, so they are no longer whole numbers.
ALTER TABLE order_items DROP COLUMN IF EXISTS size;
ALTER TABLE order_items ALTER COLUMN quantity TYPE NUMERIC(12,2) USING quantity::NUMERIC(12,2);

-- Stock rows became "product held at a place" (admin office / warehouse).
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS warehouse TEXT;
ALTER TABLE stock_items DROP COLUMN IF EXISTS item_type;
ALTER TABLE stock_items DROP COLUMN IF EXISTS size;
ALTER TABLE stock_items DROP COLUMN IF EXISTS reorder_threshold;
ALTER TABLE stock_items ALTER COLUMN quantity TYPE NUMERIC(12,2) USING quantity::NUMERIC(12,2);

-- Production batches became supplier lots of chemical.
ALTER TABLE batches RENAME TO lots;
ALTER TABLE lots RENAME COLUMN batch_code TO lot_no;
ALTER TABLE lots RENAME COLUMN start_date TO received_date;
ALTER TABLE lots RENAME COLUMN expected_completion_date TO expiry_date;
ALTER TABLE lots RENAME COLUMN stage TO status;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS warehouse TEXT;
ALTER TABLE lots ALTER COLUMN quantity TYPE NUMERIC(12,2) USING quantity::NUMERIC(12,2);

ALTER TABLE quality_checks RENAME COLUMN batch_id TO lot_id;
`;

// Upgrade steps that reference tables created by the SCHEMA block, so they run after it.
const UPGRADE_AFTER = `
ALTER TABLE income_expenses ADD COLUMN IF NOT EXISTS invoice_id INTEGER REFERENCES invoices(id);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS converted_order_id INTEGER REFERENCES orders(id);
`;

async function init() {
  // Each statement is independent: an older table that is already in the new shape
  // simply skips the steps it no longer needs, so a single try/catch per batch is safe.
  await runBatch(UPGRADE_BEFORE);
  await db.pool.query(SCHEMA);
  await runBatch(UPGRADE_AFTER);
}

// Postgres aborts the whole multi-statement query when one statement fails, so the
// upgrade batches are split per statement to keep the remaining ones running.
// Two error codes are skipped, because both mean "this database is already past that
// step": 42P01 the table has never existed (SCHEMA below creates it in its final
// shape) and 42703 the column being renamed is gone (a previous run already renamed
// it). Anything else is a real migration failure and stops the boot.
async function runBatch(sql) {
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';');
  for (const statement of statements) {
    const trimmed = statement.trim();
    if (!trimmed) continue;
    try {
      await db.pool.query(trimmed);
    } catch (e) {
      if (e.code === '42P01' || e.code === '42703') continue;
      console.error('MIGRATION STEP FAILED:', trimmed.split('\n')[0], '::', e.message);
      throw e;
    }
  }
}

module.exports = { init };

if (require.main === module) {
  init()
    .then(async () => {
      const tables = await db.all(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
      );
      console.log('Tables ready:', tables.map((t) => t.table_name).join(', '));
      process.exit(0);
    })
    .catch((e) => {
      console.error('INIT ERROR:', e.message);
      process.exit(1);
    });
}
