const db = require('./db');
const { init } = require('./init');

init();

const q = (sql) => db.prepare(sql);

function isEmpty(table) {
  return q(`SELECT COUNT(*) AS c FROM ${table}`).get().c === 0;
}

function seed() {
  const seeded = [];

  if (isEmpty('products')) {
    const products = [
      ['LS1', 'Leather Boots Black With TPR', 1499, '40,41,42,43,44', 'TPR'],
      ['LS2', 'Leather Loafer Tan Side Buckle', 999, '40,41,42,43,44', 'TPR'],
      ['LS3', 'Leather Loafer Black Full Buckle', 999, '40,41,42,43,44', 'TPR'],
      ['LS4', 'Leather Loafer Tan Full Buckle', 999, '40,41,42,43,44', 'TPR'],
      ['LS5', 'Leather Loafer Brown Side Buckle', 999, '40,41,42,43,44', 'TPR'],
      ['LS6', 'Leather Loafer Black Plain Mesh', 999, '40,41,42,43,44', 'TPR'],
      ['LS7', 'Leather Loafer Black Plain Mesh', 999, '40,41,42,43,44', 'TPR'],
      ['LS8', 'Leather Loafer Black Plain Mesh', 999, '40,41,42,43,44', 'TPR']
    ];
    const ins = q('INSERT INTO products (code, name, price, sizes_available, sole_type) VALUES (?, ?, ?, ?, ?)');
    for (const p of products) ins.run(...p);
    seeded.push('products');
  }

  if (isEmpty('customers')) {
    const customers = [
      ['Abdul Rahman Traders', '+91 98400 12345', 'Ambur, Tamil Nadu', 'Wholesale'],
      ['Al Noor Exports', '+91 98400 34567', 'Chennai, Tamil Nadu', 'Export'],
      ['Raj Leather Footwear', '+91 98400 45678', 'Ranipet, Tamil Nadu', 'Wholesale'],
      ['Style Point Retail', '+91 98400 56789', 'Vellore, Tamil Nadu', 'Retail'],
      ['Kamal Stores', '+91 98400 67890', 'Ambur, Tamil Nadu', 'Retail']
    ];
    const ins = q('INSERT INTO customers (name, phone, location, customer_type) VALUES (?, ?, ?, ?)');
    for (const c of customers) ins.run(...c);
    seeded.push('customers');
  }

  const prodId = (code) => q('SELECT id FROM products WHERE code = ?').get(code).id;
  const custId = (name) => q('SELECT id FROM customers WHERE name = ?').get(name).id;

  if (isEmpty('orders')) {
    const orders = [
      {
        customer: 'Kamal Stores', order_type: 'Single Pair', order_date: '2026-08-03',
        status: 'Delivered', payment_status: 'Paid', is_export: 0,
        items: [
          { product_code: 'LS4', size: '41', quantity: 5, unit_price: 999, unit_cost: 620 }
        ]
      },
      {
        customer: 'Abdul Rahman Traders', order_type: 'Wholesale', order_date: '2026-08-18',
        status: 'Shipped', payment_status: 'Paid', is_export: 0,
        items: [
          { product_code: 'LS1', size: '42', quantity: 100, unit_price: 1250, unit_cost: 950 }
        ]
      },
      {
        customer: 'Raj Leather Footwear', order_type: 'Wholesale', order_date: '2026-09-02',
        status: 'In Production', payment_status: 'Partial', is_export: 0,
        items: [
          { product_code: 'LS2', size: '42', quantity: 60, unit_price: 850, unit_cost: 620 },
          { product_code: 'LS3', size: '43', quantity: 40, unit_price: 850, unit_cost: 620 }
        ]
      },
      {
        customer: 'Al Noor Exports', order_type: 'Wholesale', order_date: '2026-09-06',
        status: 'Ready', payment_status: 'Unpaid', is_export: 1,
        export_country: 'United Arab Emirates', shipment_date: '2026-09-20',
        shipping_method: 'Sea Freight', tracking_ref: 'APL-77123-IND',
        items: [
          { product_code: 'LS1', size: '40', quantity: 200, unit_price: 1300, unit_cost: 950 },
          { product_code: 'LS1', size: '41', quantity: 150, unit_price: 1300, unit_cost: 950 }
        ]
      },
      {
        customer: 'Style Point Retail', order_type: 'Single Pair', order_date: '2026-09-18',
        status: 'Pending', payment_status: 'Unpaid', is_export: 0,
        items: [
          { product_code: 'LS6', size: '42', quantity: 2, unit_price: 999, unit_cost: 620 }
        ]
      },
      {
        customer: 'Abdul Rahman Traders', order_type: 'Wholesale', order_date: '2026-08-25',
        status: 'Cancelled', payment_status: 'Unpaid', is_export: 0,
        items: [
          { product_code: 'LS5', size: '44', quantity: 50, unit_price: 850, unit_cost: 620 }
        ]
      }
    ];

    const insOrder = q(`INSERT INTO orders
      (customer_id, order_type, order_date, status, payment_status, total_amount,
       is_export, export_country, shipment_date, shipping_method, tracking_ref)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insItem = q('INSERT INTO order_items (order_id, product_id, size, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?)');

    for (const o of orders) {
      const total = o.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
      const res = insOrder.run(
        custId(o.customer), o.order_type, o.order_date, o.status, o.payment_status, total,
        o.is_export, o.export_country || null, o.shipment_date || null,
        o.shipping_method || null, o.tracking_ref || null
      );
      for (const item of o.items) {
        insItem.run(res.lastInsertRowid, prodId(item.product_code), item.size, item.quantity, item.unit_price, item.unit_cost);
      }
    }
    seeded.push('orders');
  }

  if (isEmpty('batches')) {
    const batches = [
      ['LS2-2026-B01', 'LS2', 60, '2026-09-01', '2026-09-12', 'Stitching', 'Raj Leather Footwear'],
      ['LS3-2026-B02', 'LS3', 40, '2026-09-05', '2026-09-15', 'Cutting', 'Raj Leather Footwear'],
      ['LS1-2026-B03', 'LS1', 350, '2026-08-20', '2026-09-10', 'Packed', 'Al Noor Exports']
    ];
    const getOrderId = q('SELECT id FROM orders WHERE customer_id = (SELECT id FROM customers WHERE name = ?) LIMIT 1');
    const ins = q(`INSERT INTO batches (batch_code, product_id, quantity, start_date, expected_completion_date, stage, linked_order_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const b of batches) {
      const order = getOrderId.get(b[6]);
      ins.run(b[0], prodId(b[1]), b[2], b[3], b[4], b[5], order ? order.id : null);
    }
    seeded.push('batches');
  }

  if (isEmpty('stock_items')) {
    const stock = [
      ['Full Grain Leather Sheet', 'Raw Material', null, null, 42, 'sheets', 20],
      ['TPR Rubber Soles', 'Raw Material', null, null, 120, 'pairs', 150],
      ['Metal Buckles', 'Raw Material', null, null, 800, 'pcs', 300],
      ['Thread Spools', 'Raw Material', null, null, 15, 'spools', 25],
      ['Packaging Boxes', 'Raw Material', null, null, 300, 'boxes', 100],
      ['LS1 Leather Boots Black With TPR', 'Finished Stock', 'LS1', '40', 25, 'pairs', 20],
      ['LS2 Leather Loafer Tan Side Buckle', 'Finished Stock', 'LS2', '42', 14, 'pairs', 10],
      ['LS3 Leather Loafer Black Full Buckle', 'Finished Stock', 'LS3', '43', 0, 'pairs', 10],
      ['LS6 Leather Loafer Black Plain Mesh', 'Finished Stock', 'LS6', '42', 8, 'pairs', 10]
    ];
    const ins = q(`INSERT INTO stock_items (item_name, item_type, product_id, size, quantity, unit, reorder_threshold)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const s of stock) {
      const pid = s[2] ? prodId(s[2]) : null;
      ins.run(s[0], s[1], pid, s[3], s[4], s[5], s[6]);
    }
    seeded.push('stock_items');
  }

  if (isEmpty('quality_checks')) {
    const checks = [
      ['LS2-2026-B01', 'Local Grade A', 'Ramesh', '2026-09-10', 'Pass', 'Stitching even, buckles aligned.'],
      ['LS3-2026-B02', 'Export Grade', 'Farhan', '2026-09-08', 'Fail', 'Minor sole misalignment, rework required.']
    ];
    const getBatch = q('SELECT id FROM batches WHERE batch_code = ?');
    const ins = q(`INSERT INTO quality_checks (batch_id, grade, inspector_name, inspection_date, pass_fail, notes)
      VALUES (?, ?, ?, ?, ?, ?)`);
    for (const c of checks) {
      ins.run(getBatch.get(c[0]).id, c[1], c[2], c[3], c[4], c[5]);
    }
    seeded.push('quality_checks');
  }

  if (isEmpty('income_expenses')) {
    const ledger = [
      ['2026-08-05', 'Expense', 'Raw Material Purchase', 120000, 'Leather sheets and soles for August production'],
      ['2026-08-18', 'Income', 'Sales Income', 125000, 'Order full payment - LS1 wholesale (Abdul Rahman Traders)'],
      ['2026-08-25', 'Expense', 'Rent', 25000, 'Factory rent - August'],
      ['2026-09-01', 'Expense', 'Raw Material Purchase', 80000, 'Buckles, thread and packaging boxes'],
      ['2026-09-06', 'Income', 'Sales Income', 100000, 'Export order advance (30% of Al Noor Exports order)'],
      ['2026-09-08', 'Expense', 'Salary', 50000, 'Monthly worker salaries'],
      ['2026-09-16', 'Income', 'Sales Income', 4995, 'Order payment - single pair retail (Kamal Stores)'],
      ['2026-09-17', 'Expense', 'Electricity', 12000, 'Factory electricity bill - September']
    ];
    const ins = q('INSERT INTO income_expenses (entry_date, type, category, amount, note) VALUES (?, ?, ?, ?, ?)');
    for (const e of ledger) ins.run(...e);
    seeded.push('income_expenses');
  }

  return seeded;
}

module.exports = { seed };

if (require.main === module) {
  const seeded = seed();
  const counts = {};
  for (const t of ['products', 'customers', 'orders', 'order_items', 'batches', 'stock_items', 'quality_checks', 'income_expenses']) {
    counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
  }
  console.log('Seeded tables:', seeded.length ? seeded.join(', ') : 'none (already populated)');
  console.log('Row counts:', JSON.stringify(counts));
}