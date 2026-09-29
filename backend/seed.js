const db = require('./db');
const { init } = require('./init');
const { computeInvoiceTotals, paymentStatus, round2 } = require('./gst');

// Every date below is relative to the day the seed runs, so the dashboard always
// shows the last six months up to today no matter when the demo is set up.
const today = new Date();

// Local calendar date, not UTC: a seller seeding at 00:30 in India must still get
// today's date, and toISOString() would hand back yesterday because the local day
// has not started yet in UTC.
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function daysAgo(n) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() - n);
  return iso(d);
}

// A day inside the month `offset` months back (0 = this month). In the current month
// a day later than today is pulled back to today, so no entry is ever dated in the future.
function dayInMonth(offset, day) {
  const d = new Date(today.getFullYear(), today.getMonth() - offset, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  let target = Math.min(day, lastDay);
  if (offset === 0) target = Math.min(target, today.getDate());
  return iso(new Date(d.getFullYear(), d.getMonth(), target));
}

function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(y, m - 1, d);
  next.setDate(next.getDate() + days);
  return iso(next);
}

const YEAR = today.getFullYear();

async function isEmpty(t) {
  const r = await db.get(`SELECT COUNT(*) AS c FROM ${t}`);
  return r.c === 0;
}

async function seed() {
  await init();
  const seeded = [];

  // ── Seller profile ──────────────────────────────────────────────────────────────
  // The single row that makes the demo look like a real registered business. Marked
  // as sample data; the GSTIN is a dummy and is not registered with the portal.
  if (await isEmpty('seller_profile')) {
    await db.run(
      `INSERT INTO seller_profile (business_name, address, city, district, state, state_code, gstin, phone, email, is_sample)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)`,
      [
        'Surya Tech', '14/2, Katpatti Street, Vaniyambadi', 'Vaniyambadi', 'Tirupattur District',
        'Tamil Nadu', '33', '33AAAAA0000A1Z5', '+91 90031 00000', 'sales@suryatech.example'
      ]
    );
    seeded.push('seller_profile');
  }
  const seller = await db.get('SELECT * FROM seller_profile ORDER BY id LIMIT 1');

  // ── Products ───────────────────────────────────────────────────────────────────
  // Leather chemicals: tanning, retanning, fatliquoring, dyeing and finishing supplies
  // sold to tanneries. code, name, hsn, packing unit, brand, purchase / selling price,
  // GST rate, reorder level.
  const products = [
    ['ST-01', 'Chrome Tanning Salt (Basic Chromium Sulphate)', '2811', 'kg bag', 'Imported', 145, 195, 18, 40],
    ['ST-02', 'Sodium Sulphide Flakes 60%', '2833', 'kg bag', 'Domestic', 78, 112, 18, 25],
    ['ST-03', 'Formic Acid 85%', '2915', 'litre drum', 'Imported', 165, 235, 18, 15],
    ['ST-04', 'Ammonium Sulphate', '2834', 'kg bag', 'Domestic', 42, 68, 18, 60],
    ['ST-05', 'Sodium Bicarbonate', '2836', 'kg bag', 'Domestic', 24, 38, 18, 80],
    ['ST-06', 'Bating Enzyme (Bacterin)', '3504', 'kg can', 'Imported', 480, 640, 18, 12],
    ['ST-07', 'Degreasing Agent (Non-Ionic)', '3402', 'litre drum', 'Domestic', 210, 295, 18, 20],
    ['ST-08', 'Syntan (Condensed)', '2933', 'kg bag', 'Domestic', 155, 215, 18, 30],
    ['ST-09', 'Retanning Resin Polymer', '3208', 'kg can', 'Imported', 265, 355, 18, 25],
    ['ST-10', 'Synthetic Fatliquor Emulsion', '3405', 'litre drum', 'Imported', 195, 265, 18, 18],
    ['ST-11', 'Acid Black Dye (Boron 200%)', '3204', 'kg bag', 'Imported', 320, 430, 18, 10],
    ['ST-12', 'Pigment Binder (Acrylic)', '3209', 'litre drum', 'Own brand', 285, 375, 18, 15],
    ['ST-13', 'Top-Coat Lacquer (Matte)', '3208', 'litre drum', 'Own brand', 310, 420, 18, 15],
    ['ST-14', 'Wetting & Degreasing Surfactant', '3402', 'kg can', 'Own brand', 130, 185, 18, 14],
    ['ST-15', 'Industrial Pickling Salt', '2501', 'kg bag', 'Domestic', 8, 14, 5, 100]
  ];

  if (await isEmpty('products')) {
    for (const p of products) {
      await db.run(
        `INSERT INTO products (code, name, hsn_code, unit, brand, purchase_price, selling_price, gst_rate, reorder_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        p
      );
    }
    seeded.push('products');
  }

  const prodByCode = {};
  for (const p of await db.all('SELECT * FROM products ORDER BY id')) prodByCode[p.code] = p;

  // ── Customers (tanneries and leather traders) ───────────────────────────────────
  // Mostly Tamil Nadu, plus two buyers outside the state so inter-state IGST billing
  // is visible in the demo. Names, GSTINs and phone numbers are fictional.
  const customers = [
    ['Sri Kumaran Leather Works', '+91 90031 00001', 'Vaniyambadi, Tamil Nadu', 'Tannery', '33AAAAA0001A1Z5', '33'],
    ['Ananda Tanneries', '+91 90031 00002', 'Ambur, Tamil Nadu', 'Tannery', '33AAAAA0002A1Z5', '33'],
    ['Sri Ranganathan Tanning Works', '+91 90031 00003', 'Ranipet, Tamil Nadu', 'Tannery', '33AAAAA0004A1Z5', '33'],
    ['Vellore Leather Traders', '+91 90031 00004', 'Vellore, Tamil Nadu', 'Wholesale', '33AAAAA0003A1Z5', '33'],
    ['Arcot Chemical Traders', '+91 90031 00005', 'Ranipet, Tamil Nadu', 'Wholesale', '33AAAAA0005A1Z5', '33'],
    ['Meenakshi Leather Mills', '+91 90031 00006', 'Chennai, Tamil Nadu', 'Tannery', '33AAAAA0006A1Z5', '33'],
    ['Perniambut Leather Traders', '+91 90031 00007', 'Pernambut, Tamil Nadu', 'Wholesale', '33AAAAA0007A1Z5', '33'],
    ['Kaveri Tanneries', '+91 90031 00008', 'Chennai, Tamil Nadu', 'Tannery', '33AAAAA0008A1Z5', '33'],
    ['Ganga Leather Mills', '+91 90031 00009', 'Kanpur, Uttar Pradesh', 'Tannery', '09AAAAA0009A1Z5', '09'],
    ['Hooghly Tanneries', '+91 90031 00010', 'Kolkata, West Bengal', 'Tannery', '19AAAAA0010A1Z5', '19']
  ];

  if (await isEmpty('customers')) {
    for (const c of customers) {
      await db.run(
        'INSERT INTO customers (name, phone, location, customer_type, gstin, state_code) VALUES ($1, $2, $3, $4, $5, $6)',
        c
      );
    }
    seeded.push('customers');
  }

  const custByName = {};
  for (const c of await db.all('SELECT * FROM customers ORDER BY id')) custByName[c.name] = c;

  // ── Stock ──────────────────────────────────────────────────────────────────────
  // Chemical held in two places. Four lines sit below the product's reorder level —
  // the low-stock flag on the dashboard and the Stock screen.
  const stock = [
    ['ST-01', 320, 'Warehouse'],
    ['ST-02', 18, 'Warehouse'],
    ['ST-03', 46, 'Warehouse'],
    ['ST-04', 310, 'Warehouse'],
    ['ST-05', 42, 'Admin Office'],
    ['ST-06', 9, 'Warehouse'],
    ['ST-07', 64, 'Warehouse'],
    ['ST-08', 26, 'Admin Office'],
    ['ST-09', 88, 'Warehouse'],
    ['ST-10', 52, 'Warehouse'],
    ['ST-11', 27, 'Admin Office'],
    ['ST-12', 74, 'Warehouse'],
    ['ST-13', 61, 'Warehouse'],
    ['ST-14', 38, 'Admin Office'],
    ['ST-15', 450, 'Warehouse']
  ];

  if (await isEmpty('stock_items')) {
    for (const [code, qty, warehouse] of stock) {
      const p = prodByCode[code];
      await db.run(
        'INSERT INTO stock_items (product_id, item_name, quantity, unit, warehouse) VALUES ($1, $2, $3, $4, $5)',
        [p.id, p.name, qty, p.unit, warehouse]
      );
    }
    seeded.push('stock_items');
  }

  // ── Orders ──────────────────────────────────────────────────────────────────────
  // Exactly one order is still waiting for approval and one is dated today. The ten
  // oldest are already invoiced; the last confirmed order and the one waiting for
  // approval are left free so the "Create Invoice" button has something to act on.
  const orders = [
    { key: 'o1', customer: 'Ganga Leather Mills', days: 96, status: 'Delivered', supply_type: 'Bulk', items: [['ST-09', 40, 340], ['ST-10', 20, 255]] },
    { key: 'o2', customer: 'Hooghly Tanneries', days: 84, status: 'Delivered', supply_type: 'Bulk', items: [['ST-01', 50, 192], ['ST-06', 8, 620]] },
    { key: 'o3', customer: 'Meenakshi Leather Mills', days: 71, status: 'Delivered', supply_type: 'Bulk', items: [['ST-11', 18, 415], ['ST-12', 15, 360]] },
    { key: 'o4', customer: 'Sri Kumaran Leather Works', days: 60, status: 'Delivered', supply_type: 'Bulk', items: [['ST-02', 120, 104], ['ST-04', 80, 62]] },
    { key: 'o5', customer: 'Vellore Leather Traders', days: 52, status: 'Dispatched', supply_type: 'Retail', items: [['ST-05', 150, 34], ['ST-15', 200, 12]] },
    { key: 'o6', customer: 'Ananda Tanneries', days: 44, status: 'Dispatched', supply_type: 'Bulk', items: [['ST-01', 60, 186], ['ST-03', 25, 224]] },
    { key: 'o7', customer: 'Sri Ranganathan Tanning Works', days: 36, status: 'Dispatched', supply_type: 'Bulk', items: [['ST-07', 24, 282], ['ST-13', 20, 402]] },
    { key: 'o8', customer: 'Arcot Chemical Traders', days: 5, status: 'Dispatched', supply_type: 'Retail', items: [['ST-08', 45, 205], ['ST-14', 30, 178]] },
    { key: 'o9', customer: 'Kaveri Tanneries', days: 28, status: 'Confirmed', supply_type: 'Bulk', items: [['ST-03', 18, 230], ['ST-05', 100, 36]] },
    { key: 'o10', customer: 'Perniambut Leather Traders', days: 20, status: 'Confirmed', supply_type: 'Retail', items: [['ST-08', 35, 210], ['ST-14', 25, 182]] },
    { key: 'o11', customer: 'Sri Kumaran Leather Works', days: 12, status: 'Confirmed', supply_type: 'Bulk', items: [['ST-02', 90, 108], ['ST-04', 70, 65]] },
    { key: 'o12', customer: 'Meenakshi Leather Mills', days: 8, status: 'Confirmed', supply_type: 'Bulk', items: [['ST-06', 10, 625], ['ST-07', 22, 288]] },
    { key: 'o13', customer: 'Ananda Tanneries', days: 0, status: 'Pending Approval', supply_type: 'Bulk', items: [['ST-01', 40, 190], ['ST-12', 12, 368]] }
  ];

  const orderIdByKey = {};
  if (await isEmpty('orders')) {
    let n = 0;
    for (const o of orders) {
      n += 1;
      const total = round2(o.items.reduce((s, it) => s + it[1] * it[2], 0));
      orderIdByKey[o.key] = await db.tx(async (x) => {
        const info = await x.run(
          `INSERT INTO orders (order_no, customer_id, supply_type, order_date, status, payment_status, total_amount, delivery_date, vehicle_number)
           VALUES ($1, $2, $3, $4, $5, 'Unpaid', $6, $7, $8) RETURNING id`,
          [
            `SO-${YEAR}-${String(n).padStart(4, '0')}`, custByName[o.customer].id, o.supply_type,
            daysAgo(o.days), o.status, total,
            o.days > 0 ? daysAgo(Math.max(0, o.days - 3)) : null, `TN 33 AB ${4200 + n}`
          ]
        );
        for (const [code, qty, rate] of o.items) {
          const p = prodByCode[code];
          await x.run(
            'INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost) VALUES ($1, $2, $3, $4, $5)',
            [info.lastId, p.id, qty, rate, p.purchase_price]
          );
        }
        return info.lastId;
      });
    }
    seeded.push('orders');
  }

  // A re-seeded database already has the orders, so rebuild the key map from the
  // order number the seed assigns to each entry above.
  if (Object.keys(orderIdByKey).length === 0) {
    for (let i = 0; i < orders.length; i += 1) {
      const row = await db.get('SELECT id FROM orders WHERE order_no = $1', [`SO-${YEAR}-${String(i + 1).padStart(4, '0')}`]);
      if (row) orderIdByKey[orders[i].key] = row.id;
    }
  }

  // ── Quotations ─────────────────────────────────────────────────────────────────
  const quotations = [
    {
      customer: 'Sri Kumaran Leather Works', days: 34, status: 'Draft',
      notes: 'Revised rates requested for the chrome salt annual contract.',
      items: [['ST-01', 60, 192], ['ST-03', 20, 230]]
    },
    {
      customer: 'Arcot Chemical Traders', days: 26, status: 'Sent',
      notes: 'Rates hold for 15 days from the quote date.',
      items: [['ST-08', 50, 208], ['ST-14', 35, 180]]
    },
    {
      customer: 'Hooghly Tanneries', days: 19, status: 'Accepted',
      notes: 'Inter-state supply — IGST applies.',
      items: [['ST-09', 45, 342], ['ST-10', 25, 258]]
    },
    {
      customer: 'Perniambut Leather Traders', days: 12, status: 'Rejected',
      notes: 'Customer went with a local supplier on price.',
      items: [['ST-05', 120, 35], ['ST-15', 250, 13]]
    },
    {
      customer: 'Kaveri Tanneries', days: 4, status: 'Accepted',
      notes: 'Accepted against the trial batch results.',
      items: [['ST-06', 10, 625], ['ST-07', 22, 288]]
    }
  ];

  if (await isEmpty('quotations')) {
    let n = 0;
    for (const q of quotations) {
      n += 1;
      const total = round2(q.items.reduce((s, it) => s + it[1] * it[2], 0));
      const qdate = daysAgo(q.days);
      await db.tx(async (x) => {
        const info = await x.run(
          `INSERT INTO quotations (quotation_no, customer_id, quote_date, valid_until, status, total_amount, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [`QTN-${YEAR}-${String(n).padStart(4, '0')}`, custByName[q.customer].id, qdate, addDays(qdate, 15), q.status, total, q.notes]
        );
        for (const [code, qty, rate] of q.items) {
          const p = prodByCode[code];
          await x.run(
            'INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, unit_cost) VALUES ($1, $2, $3, $4, $5)',
            [info.lastId, p.id, qty, rate, p.purchase_price]
          );
        }
        return info.lastId;
      });
    }
    seeded.push('quotations');
  }

  // ── Invoices (GST, linked to orders) ────────────────────────────────────────────
  // Ten tax invoices, one per invoiced order. Sales inside Tamil Nadu are billed with
  // CGST + SGST, the two buyers outside the state with IGST. Due dates follow a 30-day
  // credit term, so the three oldest invoices are 37, 50 and 62 days overdue and the
  // Pending Payments screen shows all three ageing buckets.
  const invoicePlan = [
    { order: 'o1', days: 96, paid: 'part', payAfter: 10 },
    { order: 'o2', days: 84, paid: 'none' },
    { order: 'o3', days: 71, paid: 'full', payAfter: 12 },
    { order: 'o4', days: 60, paid: 'part', payAfter: 8 },
    { order: 'o5', days: 52, paid: 'none' },
    { order: 'o6', days: 44, paid: 'full', payAfter: 6 },
    { order: 'o7', days: 36, paid: 'none' },
    { order: 'o9', days: 28, paid: 'part', payAfter: 4 },
    { order: 'o10', days: 20, paid: 'none' },
    { order: 'o11', days: 12, paid: 'full', payAfter: 2 }
  ];

  if (await isEmpty('invoices')) {
    let n = 0;
    for (const plan of invoicePlan) {
      const orderId = orderIdByKey[plan.order];
      if (!orderId) continue;
      n += 1;
      const customer = custByName[orders.find((o) => o.key === plan.order).customer];
      const items = await db.all(`
        SELECT oi.*, p.name AS product_name, p.hsn_code, p.unit, p.gst_rate
        FROM order_items oi JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1 ORDER BY oi.id`, [orderId]);

      const totals = computeInvoiceTotals(
        items.map((it) => ({
          product_id: it.product_id, hsn_code: it.hsn_code, description: it.product_name,
          unit: it.unit, quantity: it.quantity, rate: it.unit_price, gst_rate: it.gst_rate
        })),
        seller.state_code,
        customer.state_code
      );

      const invoiceDate = daysAgo(Math.max(0, plan.days - 4));
      const dueDate = addDays(invoiceDate, 30);
      const paid = plan.paid === 'full' ? totals.total
        : plan.paid === 'part' ? round2(totals.total / 2) : 0;
      const status = paymentStatus(paid, totals.total);

      const invoiceId = await db.tx(async (x) => {
        const info = await x.run(`
          INSERT INTO invoices (invoice_no, order_id, customer_id, invoice_date, due_date, status, place_of_supply,
            seller_gstin, buyer_gstin, subtotal, cgst, sgst, igst, total_amount, amount_paid, amount_due, amount_in_words)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
          [
            `INV-${YEAR}-${String(n).padStart(4, '0')}`, orderId, customer.id, invoiceDate, dueDate, status,
            totals.place_of_supply, seller.gstin, customer.gstin, totals.subtotal, totals.cgst, totals.sgst,
            totals.igst, totals.total, paid, round2(totals.total - paid), totals.amount_in_words
          ]
        );
        for (const line of totals.items) {
          await x.run(`INSERT INTO invoice_items
            (invoice_id, product_id, hsn_code, description, unit, quantity, rate, taxable_value, gst_rate, tax_amount)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [info.lastId, line.product_id, line.hsn_code, line.description, line.unit, line.quantity,
              line.rate, line.taxable_value, line.gst_rate, line.tax_amount]
          );
        }
        if (paid > 0) {
          await x.run('INSERT INTO invoice_payments (invoice_id, payment_date, amount, mode, note) VALUES ($1, $2, $3, $4, $5)',
            [info.lastId, addDays(invoiceDate, plan.payAfter), paid, 'NEFT',
              plan.paid === 'full' ? 'Full payment received' : 'Part payment received']);
        }
        return info.lastId;
      });
      if (invoiceId) {
        await db.run('UPDATE orders SET payment_status = $1 WHERE id = $2', [status === 'Paid' ? 'Paid' : 'Partial', orderId]);
      }
    }
    seeded.push('invoices');
  }

  // ── Lots (supplier deliveries with batch numbers) ───────────────────────────────
  const lots = [
    ['ST-01', 60, 'Kovai Chemicals Distributors', 118, 24, 'Warehouse', 'In Stock'],
    ['ST-02', 40, 'Annamalai Agro Chemicals', 96, 18, 'Warehouse', 'In Stock'],
    ['ST-03', 30, 'Chennai Acid Traders', 74, 14, 'Warehouse', 'In Stock'],
    ['ST-06', 12, 'Metro Enzyme Technologies', 61, 9, 'Warehouse', 'Partly Issued'],
    ['ST-09', 45, 'Southern Tannery Supplies', 47, 15, 'Warehouse', 'In Stock'],
    ['ST-11', 20, 'Metro Pigments & Dyes', 33, 10, 'Admin Office', 'In Stock'],
    ['ST-12', 25, 'Surya Tech (own brand)', 20, 12, 'Warehouse', 'In Stock'],
    ['ST-13', 20, 'Surya Tech (own brand)', 9, 12, 'Warehouse', 'Received'],
    ['ST-05', 100, 'Kovai Chemicals Distributors', 4, 18, 'Admin Office', 'In Stock']
  ];

  if (await isEmpty('lots')) {
    let n = 0;
    for (const [code, qty, supplier, days, expiryMonths, warehouse, status] of lots) {
      n += 1;
      const p = prodByCode[code];
      const received = daysAgo(days);
      const expiry = new Date(received + 'T00:00:00Z');
      expiry.setUTCMonth(expiry.getUTCMonth() + expiryMonths);
      await db.run(
        `INSERT INTO lots (lot_no, product_id, supplier, received_date, expiry_date, quantity, status, warehouse)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [`LOT-${YEAR}-${String(n).padStart(4, '0')}`, p.id, supplier, received, iso(expiry), qty, status, warehouse]
      );
    }
    seeded.push('lots');
  }

  // ── Technical visits (consulting at the tannery) ────────────────────────────────
  const visits = [
    {
      customer: 'Sri Kumaran Leather Works', days: 52, engineer: 'R. Karthikeyan',
      issue: 'Uneven dye uptake across the wet-blue panels',
      solution: 'Cut salt dose to 8 g/L, raised liquor temperature to 60 C and set a 45-minute rotation for the last two drums.',
      followUpOffset: 7, status: 'Resolved'
    },
    {
      customer: 'Ananda Tanneries', days: 41, engineer: 'S. Meenakshi',
      issue: 'Low chrome exhaustion — high chrome in the spent liquor',
      solution: 'Introduced a lime-free pickling stage and offered the low-liquor ratio chrome liquor for trial.',
      followUpOffset: -6, status: 'Resolved'
    },
    {
      customer: 'Ganga Leather Mills', days: 29, engineer: 'R. Karthikeyan',
      issue: 'Loose grain and pinholes on the finished leather',
      solution: 'Bating temperature dropped to 28 C, bacterin dose reduced and drum speed increased for better mixing.',
      followUpOffset: 4, status: 'Follow-up Due'
    },
    {
      customer: 'Hooghly Tanneries', days: 18, engineer: 'D. Venkatesh',
      issue: 'Shade variation between batches of the same black',
      solution: 'Standardised the acid black dosing with a dissolve tank and fixed a 20-minute dump temperature.',
      followUpOffset: 11, status: 'Follow-up Due'
    },
    {
      customer: 'Meenakshi Leather Mills', days: 9, engineer: 'S. Meenakshi',
      issue: 'Oily streaks on the retanned leather after fatliquor addition',
      solution: 'Pre-dispersed the fatliquor, cut the dose by 15% and moved the addition to the second drum wash.',
      followUpOffset: 12, status: 'Open'
    },
    {
      customer: 'Kaveri Tanneries', days: 2, engineer: 'D. Venkatesh',
      issue: 'Trial of the own-brand pigment binder for a top-coat finish',
      solution: 'Running an 8-hour trial on a 200 kg lot; two coats at 8 g/L with a 20-minute flash between coats.',
      followUpOffset: 14, status: 'Open'
    }
  ];

  if (await isEmpty('technical_visits')) {
    for (const v of visits) {
      const visitDate = daysAgo(v.days);
      const followUp = daysAgo(Math.max(0, v.days - v.followUpOffset));
      await db.run(
        `INSERT INTO technical_visits (customer_id, visit_date, engineer, issue, solution_given, follow_up_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [custByName[v.customer].id, visitDate, v.engineer, v.issue, v.solution, followUp, v.status]
      );
    }
    seeded.push('technical_visits');
  }

  // ── Cash ledger (last six months) ───────────────────────────────────────────────
  // Sales receipts, supplier purchases, salary, rent, transport plus the consulting
  // and brokerage income. Income is above expenses in every month, and this month's
  // salary run is 50,000.
  const ledgerMonths = [
    { sales: 490000, consulting: 65000, brokerage: 30000, purchase: 260000, salary: 50000, rent: 28000, transport: 23000 },
    { sales: 470000, consulting: 60000, brokerage: 35000, purchase: 255000, salary: 49000, rent: 28000, transport: 22000 },
    { sales: 445000, consulting: 40000, brokerage: 55000, purchase: 240000, salary: 48000, rent: 28000, transport: 24000 },
    { sales: 410000, consulting: 52000, brokerage: 25000, purchase: 225000, salary: 46000, rent: 28000, transport: 20000 },
    { sales: 390000, consulting: 38000, brokerage: 42000, purchase: 210000, salary: 45000, rent: 28000, transport: 21000 },
    { sales: 360000, consulting: 45000, brokerage: 30000, purchase: 190000, salary: 44000, rent: 28000, transport: 19000 }
  ];

  if (await isEmpty('income_expenses')) {
    for (let m = 0; m < ledgerMonths.length; m += 1) {
      const e = ledgerMonths[m];
      const entries = [
        [3, 'Expense', 'Supplier Purchase', e.purchase, 'Chemical consignment bought from suppliers'],
        [5, 'Expense', 'Salary', e.salary, 'Monthly staff salary'],
        [6, 'Expense', 'Rent', e.rent, 'Office and godown rent'],
        [9, 'Expense', 'Transport', e.transport, 'Lorry freight for deliveries'],
        [12, 'Income', 'Sales Receipt', e.sales, 'Customer receipts for the month'],
        [20, 'Income', 'Consulting Income', e.consulting, 'Technical consultancy retainer from tanneries'],
        [24, 'Income', 'Brokerage Income', e.brokerage, 'Brokerage on supplier introductions']
      ];
      for (const [day, type, category, amount, note] of entries) {
        await db.run(
          'INSERT INTO income_expenses (entry_date, type, category, amount, note) VALUES ($1, $2, $3, $4, $5)',
          [dayInMonth(m, day), type, category, amount, note]
        );
      }
    }
    seeded.push('income_expenses');
  }

  // ── Incoming lot inspection (Quality screen is hidden from the navigation) ──────
  if (await isEmpty('quality_checks')) {
    const lotRows = await db.all('SELECT id, lot_no FROM lots ORDER BY id');
    const checks = [
      [0, 'Grade A', 'R. Karthikeyan', 110, 'Pass', 'Moisture and pH within limits, clear solution.'],
      [4, 'Grade B', 'S. Meenakshi', 40, 'Pass', 'Minor shade variation noted; approved for retanning use.']
    ];
    for (const [lotIndex, grade, inspector, day, result, notes] of checks) {
      const lot = lotRows[lotIndex];
      if (!lot) continue;
      await db.run(
        `INSERT INTO quality_checks (lot_id, grade, inspector_name, inspection_date, pass_fail, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [lot.id, grade, inspector, daysAgo(day), result, notes]
      );
    }
    seeded.push('quality_checks');
  }

  return seeded;
}

module.exports = { seed };

if (require.main === module) {
  (async () => {
    const seeded = await seed();
    const counts = {};
    for (const t of ['products', 'customers', 'stock_items', 'orders', 'order_items', 'quotations', 'invoices', 'invoice_items', 'lots', 'technical_visits', 'income_expenses']) {
      counts[t] = (await db.get(`SELECT COUNT(*) AS c FROM ${t}`)).c;
    }
    console.log('Seeded tables:', seeded.length ? seeded.join(', ') : 'none (already populated)');
    console.log('Row counts:', JSON.stringify(counts));
    await db.pool.end();
    process.exit(0);
  })().catch((e) => {
    console.error('SEED ERROR:', e.message);
    process.exit(1);
  });
}
