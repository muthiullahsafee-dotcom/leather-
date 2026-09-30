const db = require('./db');
const { init } = require('./init');
const { computeInvoiceTotals, paymentStatus, round2 } = require('./gst');
const { nextDocNo, nextFyDocNo, financialYear } = require('./numbers');
const { today, addDays } = require('./dates');
const {
  PRODUCTS, SELLER, CUSTOMERS, LOTS, QUOTATIONS, ORDERS, INVOICES, VISITS, LEDGER,
  CURRENT_MONTH_OTHER_NOTE, ORDER_PAYMENT_STATUS
} = require('./seed_data');

// Reset + seed for the Surya Tech demo.
//
// This REPLACES the old seed.js, which wrapped every insert in an `isEmpty(table)`
// guard. That guard was the reason the live app kept showing the footwear catalogue:
// the tables were already populated (from the earlier demo), so seeding a fresh
// dataset wrote nothing at all and the old rows survived. Here every business table is
// emptied unconditionally on every run, so `npm run reseed` converges on the same
// dataset no matter what state the database is in.
//
// The dataset itself lives in seed_data.js as plain data, which lets verify_seed.cjs
// assert every invariant (low-stock count, ageing, GST split, monthly profit) without
// a database connection.

// Every table that holds demo data, ordered child-first so the deletes never trip a
// foreign key. `quality_checks` is emptied but never repopulated: incoming-lot
// inspection is a hidden screen, and leaving it empty keeps the demo free of records
// that reference nothing the user can see.
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

const COUNTS_TABLES = [
  'products', 'customers', 'stock_items', 'orders', 'order_items', 'quotations',
  'quotation_items', 'invoices', 'invoice_items', 'invoice_payments', 'lots',
  'technical_visits', 'income_expenses', 'quality_checks', 'seller_profile'
];

// Deletion order as one list of statements, so a failure part-way leaves an obvious
// gap in the log rather than a silent partial reset.
async function wipe() {
  for (const t of TABLES) {
    await db.run(`DELETE FROM ${t}`);
  }
}

// ─── Date helpers ───────────────────────────────────────────────────────────────
// All dates are plain 'YYYY-MM-DD' strings in the seller's local calendar day (see
// dates.js). Everything below is derived from today, so the demo is always "current".

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

// A day inside the month `offset` months back (0 = this month). In the current month
// a day later than today is pulled back to today, so no entry is ever dated in the
// future — which matters because the "Today's New Orders" tile counts on exactly that.
function dayInMonth(offset, day) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  let target = Math.min(day, lastDay);
  if (offset === 0) target = Math.min(target, now.getDate());
  return iso(new Date(d.getFullYear(), d.getMonth(), target));
}

function addMonths(date, months) {
  const d = new Date(date + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return iso(d);
}

async function seed() {
  await init();
  await wipe();

  // ─── Seller ───────────────────────────────────────────────────────────────────
  await db.run(
    `INSERT INTO seller_profile (business_name, address, city, district, state, state_code, gstin, phone, email, is_sample)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [SELLER.business_name, SELLER.address, SELLER.city, SELLER.district, SELLER.state,
      SELLER.state_code, SELLER.gstin, SELLER.phone, SELLER.email, SELLER.is_sample]
  );
  const seller = await db.get('SELECT * FROM seller_profile ORDER BY id LIMIT 1');

  // ─── Products ─────────────────────────────────────────────────────────────────
  // Inserted in code order, so the ids the rest of the seed resolves by code are
  // stable and reproducible.
  const prodByCode = {};
  for (const p of PRODUCTS) {
    const info = await db.run(
      `INSERT INTO products (code, name, hsn_code, unit, brand, purchase_price, selling_price, gst_rate, reorder_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 18, $8) RETURNING id`,
      [p.code, p.name, p.hsn, p.unit, p.brand, p.purchase, p.selling, p.reorder]
    );
    prodByCode[p.code] = { ...p, id: info.lastId };
  }

  // ─── Customers ────────────────────────────────────────────────────────────────
  const custByName = {};
  for (const c of CUSTOMERS) {
    const info = await db.run(
      `INSERT INTO customers (name, phone, location, customer_type, gstin, state_code, credit_terms_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [c.name, c.phone, c.location, c.customer_type, c.gstin, c.state_code, c.creditTerms]
    );
    custByName[c.name] = { ...c, id: info.lastId };
  }

  // ─── Stock ────────────────────────────────────────────────────────────────────
  // The opening position, before the seeded invoices consume any of it. One row per
  // chemical in the warehouse. The four chemicals whose opening stock is already below
  // their reorder level are the four the dashboard's Low Stock tile reports; the seed
  // sizes the invoice quantities so they stay the only four after invoicing.
  for (const p of PRODUCTS) {
    await db.run(
      'INSERT INTO stock_items (product_id, item_name, quantity, unit, warehouse) VALUES ($1, $2, $3, $4, $5)',
      [p.id, p.name, p.openingStock, p.unit, 'Warehouse']
    );
  }

  // ─── Orders ───────────────────────────────────────────────────────────────────
  // SO-<year>-NNNN, allocated from the same helper the API uses so a hand-raised order
  // after the seed continues the series rather than colliding with it.
  const orderByKey = {};
  for (const o of ORDERS) {
    const total = round2(o.items.reduce((s, it) => s + it[1] * it[2], 0));
    const id = await db.tx(async (x) => {
      const order_no = await nextDocNo(x, 'SO', 'orders', 'order_no');
      const info = await x.run(
        `INSERT INTO orders (order_no, customer_id, supply_type, order_date, status, payment_status, total_amount, delivery_date, vehicle_number)
         VALUES ($1, $2, $3, $4, $5, 'Unpaid', $6, $7, $8) RETURNING id`,
        [order_no, custByName[o.customer].id, o.supply_type, daysAgo(o.daysAgo), o.status,
          total, o.daysAgo > 0 ? addDays(daysAgo(o.daysAgo), 4) : null,
          `TN 33 AB ${4200 + ORDERS.indexOf(o)}`]
      );
      for (const [code, qty, rate] of o.items) {
        await x.run(
          'INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost) VALUES ($1, $2, $3, $4, $5)',
          [info.lastId, prodByCode[code].id, qty, rate, prodByCode[code].purchase]
        );
      }
      return info.lastId;
    });
    orderByKey[o.key] = id;
  }

  // ─── Quotations ───────────────────────────────────────────────────────────────
  // QTN-<year>-NNNN. An Accepted quotation is linked back to the order it became, so
  // the Quotations screen can show "converted" instead of leaving the buyer to guess.
  for (const q of QUOTATIONS) {
    const total = round2(q.items.reduce((s, it) => s + it[1] * it[2], 0));
    const quoteDate = daysAgo(q.daysAgo);
    await db.tx(async (x) => {
      const quotation_no = await nextDocNo(x, 'QTN', 'quotations', 'quotation_no');
      const info = await x.run(
        `INSERT INTO quotations (quotation_no, customer_id, quote_date, valid_until, status, total_amount, notes, converted_order_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [quotation_no, custByName[q.customer].id, quoteDate, addDays(quoteDate, 15), q.status,
          total, q.notes, q.convertToOrder ? orderByKey[q.convertToOrder] : null]
      );
      for (const [code, qty, rate] of q.items) {
        await x.run(
          'INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, unit_cost) VALUES ($1, $2, $3, $4, $5)',
          [info.lastId, prodByCode[code].id, qty, rate, prodByCode[code].purchase]
        );
      }
    });
  }

  // ─── Invoices ─────────────────────────────────────────────────────────────────
  // ST/<FY>/NNNN, the financial-year series a GST invoice is numbered in.
  //
  // Each invoice is built from its order's own line items and priced through the
  // shared gst.js helper, so the tax split is identical to what the API would produce.
  // The due date comes from that buyer's credit terms rather than a fixed 30 days,
  // which is what produces a realistic spread of ageing buckets. Raising the invoice
  // also consumes the stock it bills, exactly like routes/invoices.js does, inside the
  // same transaction.
  // Payments land on their own real payment date, which for the oldest invoices is a
  // month or more back. They are collected here so the ledger section below can split
  // each month's sales figure between invoice-linked receipts and a balancing row,
  // keyed by the month the money actually arrived in.
  const receiptLedgerRows = [];
  for (const plan of INVOICES) {
    const order = ORDERS.find((o) => o.key === plan.order);
    const orderId = orderByKey[plan.order];
    const customer = custByName[order.customer];
    const orderDate = daysAgo(order.daysAgo);
    const invoiceDate = addDays(orderDate, plan.daysAfterOrder);
    const dueDate = addDays(invoiceDate, customer.creditTerms);

    const items = order.items.map(([code, qty, rate]) => ({
      product_id: prodByCode[code].id,
      hsn_code: prodByCode[code].hsn,
      description: prodByCode[code].name,
      unit: prodByCode[code].unit,
      quantity: qty,
      rate,
      gst_rate: 18
    }));

    const totals = computeInvoiceTotals(items, seller.state_code, customer.state_code);
    const paid = plan.paid === 'full' ? totals.total
      : plan.paid === 'part' ? round2(totals.total / 2) : 0;
    const status = paymentStatus(paid, totals.total);

    const invoiceId = await db.tx(async (x) => {
      const invoice_no = await nextFyDocNo(x, 'ST', 'invoices', 'invoice_no');
      const info = await x.run(`
        INSERT INTO invoices (invoice_no, order_id, customer_id, invoice_date, due_date, status, place_of_supply,
          seller_gstin, buyer_gstin, subtotal, cgst, sgst, igst, total_amount, amount_paid, amount_due, amount_in_words)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
        [invoice_no, orderId, customer.id, invoiceDate, dueDate, status, totals.place_of_supply,
          seller.gstin, customer.gstin, totals.subtotal, totals.cgst, totals.sgst, totals.igst,
          totals.total, paid, round2(totals.total - paid), totals.amount_in_words]
      );
      for (const line of totals.items) {
        await x.run(
          `INSERT INTO invoice_items
            (invoice_id, product_id, hsn_code, description, unit, quantity, rate, taxable_value, gst_rate, tax_amount)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [info.lastId, line.product_id, line.hsn_code, line.description, line.unit, line.quantity,
            line.rate, line.taxable_value, line.gst_rate, line.tax_amount]
        );
        // Same stock movement the API makes when an invoice is raised.
        const stockRow = await x.get(
          "SELECT id FROM stock_items WHERE product_id = $1 AND warehouse = 'Warehouse' ORDER BY id LIMIT 1",
          [line.product_id]
        );
        if (stockRow) {
          await x.run('UPDATE stock_items SET quantity = ROUND(quantity - $1, 2) WHERE id = $2',
            [line.quantity, stockRow.id]);
        }
      }
      if (paid > 0) {
        const payDate = addDays(invoiceDate, plan.payDaysAfterInvoice);
        await x.run(
          'INSERT INTO invoice_payments (invoice_id, payment_date, amount, mode, note) VALUES ($1, $2, $3, $4, $5)',
          [info.lastId, payDate, paid, plan.mode,
            plan.paid === 'full' ? 'Full payment received' : 'Part payment received']
        );
        // Every receipt posts its own ledger row, linked to the invoice, so the cash
        // ledger and the receivables can always be reconciled against each other.
        receiptLedgerRows.push({
          date: payDate,
          amount: paid,
          invoice_id: info.lastId,
          note: `Payment against invoice ${invoice_no} (${plan.mode})`
        });
      }
      return info.lastId;
    });

    await db.run('UPDATE orders SET payment_status = $1 WHERE id = $2',
      [ORDER_PAYMENT_STATUS[plan.paid], orderId]);
    void invoiceId;
  }

  // ─── Lots ─────────────────────────────────────────────────────────────────────
  for (const l of LOTS) {
    const p = prodByCode[l.product];
    const lot_no = await db.tx((x) => nextDocNo(x, 'LOT', 'lots', 'lot_no'));
    const received = daysAgo(l.receivedDaysAgo);
    await db.run(
      `INSERT INTO lots (lot_no, product_id, supplier, received_date, expiry_date, quantity, status, warehouse)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [lot_no, p.id, l.supplier, received, addMonths(received, l.expiryMonths), l.quantity, l.status, l.warehouse]
    );
  }

  // ─── Technical visits ─────────────────────────────────────────────────────────
  for (const v of VISITS) {
    const visitDate = daysAgo(v.daysAgo);
    await db.run(
      `INSERT INTO technical_visits (customer_id, visit_date, engineer, issue, solution_given, follow_up_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [custByName[v.customer].id, visitDate, v.engineer, v.issue, v.solution,
        addDays(visitDate, v.followUpOffset), v.status]
    );
  }

  // ─── Cash ledger ──────────────────────────────────────────────────────────────
  // Walked newest-first (LEDGER[0] is this month).
  //
  // Each month's sales figure is made up of two pieces: the invoice-linked receipts
  // already inserted above that actually landed in that month, plus one balancing row
  // for the rest of the month's takings. Splitting per month rather than folding every
  // receipt into the current month is what keeps each month's income exactly equal to
  // its intended figure and keeps the ledger reconcilable against the invoices.
  const receiptsByMonth = {};
  for (const r of receiptLedgerRows) {
    const key = r.date.slice(0, 7);
    receiptsByMonth[key] = round2((receiptsByMonth[key] || 0) + r.amount);
  }

  const salesPerMonth = {};
  for (let m = 0; m < LEDGER.length; m += 1) {
    const key = dayInMonth(m, 1).slice(0, 7);
    salesPerMonth[key] = { booked: LEDGER[m].sales, receipts: receiptsByMonth[key] || 0 };
  }

  for (let m = 0; m < LEDGER.length; m += 1) {
    const e = LEDGER[m];
    const key = dayInMonth(m, 1).slice(0, 7);
    const split = salesPerMonth[key];
    const otherSales = round2(split.booked - split.receipts);
    const entries = [
      [3, 'Expense', 'Supplier Purchase', e.purchase, 'Chemical consignment bought from suppliers'],
      [5, 'Expense', 'Salary', e.salary, 'Monthly staff salary'],
      [6, 'Expense', 'Rent', e.rent, 'Office and godown rent'],
      [9, 'Expense', 'Transport', e.transport, 'Lorry freight for deliveries'],
      [12, 'Income', 'Consulting Income', e.consulting, 'Technical consultancy retainer from tanneries'],
      [20, 'Income', 'Brokerage Income', e.brokerage, 'Brokerage on supplier introductions'],
      // The balancing row tops the month's sales figure up to its booked total once the
      // invoice-linked receipts already in that month are taken out.
      [24, 'Income', 'Sales Receipt', otherSales,
        m === 0 ? CURRENT_MONTH_OTHER_NOTE : 'Customer receipts for the month']
    ];
    for (const [day, type, category, amount, note] of entries) {
      await db.run(
        'INSERT INTO income_expenses (entry_date, type, category, amount, note) VALUES ($1, $2, $3, $4, $5)',
        [dayInMonth(m, day), type, category, amount, note]
      );
    }
  }

  // Invoice receipts posted against their invoice, dated on the payment day.
  for (const r of receiptLedgerRows) {
    await db.run(
      `INSERT INTO income_expenses (entry_date, type, category, amount, note, invoice_id)
       VALUES ($1, 'Income', 'Sales Receipt', $2, $3, $4)`,
      [r.date, r.amount, r.note, r.invoice_id]
    );
  }

  const monthSalesFromInvoices = round2(
    Object.values(receiptsByMonth).reduce((s, v) => s + v, 0)
  );
  const otherSales = round2(salesPerMonth[dayInMonth(0, 1).slice(0, 7)].booked
    - salesPerMonth[dayInMonth(0, 1).slice(0, 7)].receipts);

  return { monthSalesFromInvoices, otherSales, salesPerMonth };
}

async function counts() {
  const out = {};
  for (const t of COUNTS_TABLES) {
    out[t] = (await db.get(`SELECT COUNT(*) AS c FROM ${t}`)).c;
  }
  return out;
}

module.exports = { seed, wipe, counts, TABLES, COUNTS_TABLES };

if (require.main === module) {
    (async () => {
      const result = await seed();
      const c = await counts();
      console.log('Reset + seed complete.');
      console.log('Invoice numbering FY:', financialYear(), '· today:', today());
      console.log('Invoice receipts by month:', JSON.stringify(result.salesPerMonth));
      console.log('Row counts:', JSON.stringify(c, null, 2));
      await db.pool.end();
      process.exit(0);
    })().catch((e) => {
      console.error('RESEED ERROR:', e.message);
      process.exit(1);
    });
  }
