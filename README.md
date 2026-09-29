# Surya Tech — Leather Chemicals Business Management Demo

A demo web app for **Surya Tech**, a leather chemicals wholesaler and technical consultant
in Vaniyambadi, Tamil Nadu. It covers the day-to-day operations of the business — chemical
product master, stock, customers, quotations, sales orders, GST invoices, receivables,
supplier lots, technical visits, the cash ledger and reports — behind a responsive React UI,
a small Express API and a hosted PostgreSQL (Supabase) database.

This is a **demo**, not a production system: it has no authentication and uses seeded
sample data, but it is wired up to be deployed — the backend runs on Render and the
database on Supabase.

---

## Tech stack

| Layer     | Choice                                             |
| --------- | -------------------------------------------------- |
| Frontend  | React 18 (functional components + hooks), Vite 6   |
| Charts    | Recharts 2                                         |
| Backend   | Node.js + Express 4                                |
| Database  | PostgreSQL via `pg` (Supabase / Render-managed DB)  |
| Styling   | Plain CSS (responsive, no UI framework)            |

---

## Project structure

```
lether campany/
├─ backend/
│  ├─ server.js              # Express app, mounts all routes, listens on 3001
│  ├─ db.js                  # PostgreSQL pool (pg) + run/all/get/tx helpers
│  ├─ init.js                # idempotent schema + upgrade statements
│  ├─ seed.js                # inserts sample data
│  ├─ gst.js                 # GST state codes, CGST/SGST vs IGST, number-to-words
│  ├─ numbers.js             # document number sequences (QTN / SO / INV)
│  ├─ dates.js               # calendar-date helpers (today, addDays, daysBetween)
│  ├─ reset.js               # truncate + re-init
│  ├─ verify.js              # checks the schema columns
│  ├─ check_seed.cjs         # checks seeded row counts + integrity
│  ├─ route_verify.cjs       # in-process checks for all route modules
│  ├─ e2e_verify.cjs         # end-to-end flow check (serves frontend + API)
│  ├─ .env.example           # template for DATABASE_URL and PG_SSL
│  ├─ services/
│  │  └─ gstPortal.js        # demo IRN / e-way bill generation (no portal calls)
│  └─ routes/
│     ├─ products.js  ├─ stock.js      ├─ customers.js  ├─ quotations.js
│     ├─ orders.js    ├─ invoices.js   ├─ batches.js    ├─ quality.js
│     ├─ visits.js    ├─ seller.js     ├─ ledger.js     └─ reports.js
└─ frontend/
   ├─ vite.config.js         # dev server on 5173, proxies /api -> 3001
   └─ src/
      ├─ App.jsx             # shell + responsive navigation
      ├─ index.css           # layout, components, responsive rules
      ├─ theme.css           # design tokens (colors, type, radius, shadow)
      ├─ format.js           # ₹/en-IN money + calendar-date helpers
      ├─ palette.js          # chart colors (SVG needs literal values)
      ├─ apiClient.js        # fetch wrapper: typed errors, array normalization
      ├─ states.js           # GST state codes accepted by the backend
      ├─ LineItems.jsx       # shared line-item editor (Orders, Quotations)
      └─ modules/            # Dashboard, Products, Stock, Customers, Quotations,
                             # Orders, Invoices, PendingPayments, Lots, Visits,
                             # Ledger, Reports
```

---

## Getting started

Prerequisites: **Node.js 18+** (developed on Node 24) and npm.

### 1. Backend

The database is hosted (PostgreSQL on Supabase, or a managed Postgres on Render). Point
the backend at it before starting:

```
cd backend
npm install
copy .env.example .env       # then edit .env with your real DATABASE_URL
npm run seed                 # create tables and load sample data (idempotent)
npm run dev                  # http://localhost:3001
```

`DATABASE_URL` is read from `.env` (or the process environment). `npm run seed` applies
the schema if needed and loads the sample data; it is safe to re-run. Set `PG_SSL=false`
only for a Postgres that does not use TLS.

### 2. Frontend

```
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

Open **http://localhost:5173**. The Vite dev server proxies all `/api/*` calls to the
backend on port 3001, so both must be running.

To produce a static build: `npm run build` (output in `frontend/dist`). When deploying,
set `VITE_API_URL` to the live backend URL before building so the bundle calls it directly.

---

## Modules

1. **Dashboard** — five stat tiles (today's new orders, pending approval, pending payments,
   low-stock chemicals, salary paid this month), each linking to the screen it describes,
   plus the monthly income/profit chart and the pending-approval and low-stock lists.
2. **Products** — chemical master (code, name, HSN code, packing unit, brand, purchase and
   selling price with a derived margin, GST rate, reorder level) with search, add/edit/delete.
3. **Stock** — chemical stock held at the *Warehouse* and *Admin Office*, each row flagged
   low against the product's reorder level, with low-stock and place filters.
4. **Customers** — tannery / wholesale / retail accounts with GSTIN and GST state code (the
   state decides CGST + SGST vs IGST), plus order count and outstanding amount per buyer.
5. **Quotations** — price offers with validity, status (Draft / Sent / Accepted / Rejected)
   and one-click **Convert to Order**, which copies the lines into a sales order.
6. **Orders** — bulk and retail sales orders, line items, delivery date and vehicle number,
   live status and payment status, and a **Create Invoice** action that raises the GST tax
   invoice (and reduces stock) from the order.
7. **Invoices** — tax invoices with the CGST/SGST or IGST split, amount in words, the payment
   trail, receipt recording, and demo e-invoice IRN / e-way bill generation.
8. **Pending Payments** — everything still owing, aged from each due date into 0-30 / 31-60 /
   60+ buckets, with a receipt form that posts to the invoice and the cash ledger.
9. **Lots** — supplier lots of chemical: lot number, supplier, received and expiry dates,
   quantity, place held and status (*Received → In Stock → Partly Issued → Expired*).
10. **Technical Visits** — consultant visits as cards: the issue observed, the solution given,
    the follow-up date (flagged when past due) and the visit status.
11. **Ledger** — cash ledger with income/expense totals, net, type filter and a running balance.
12. **Reports** — Sales Over Time, Profit by Month, Stock by Chemical, Orders by Status,
    plus invoice status and the stock-by-product table.

The layout is responsive: a fixed sidebar on screens ≥ 992 px and a bottom navigation
bar on smaller screens.

---

## API reference

Base URL: `http://localhost:3001`

| Method | Endpoint                        | Purpose                                        |
| ------ | ------------------------------- | ---------------------------------------------- |
| GET    | `/api/health`                   | health check                                   |
| GET    | `/api/products`                 | list products                                  |
| GET    | `/api/products/:id`             | one product                                    |
| POST   | `/api/products`                 | create product                                 |
| PUT    | `/api/products/:id`             | update product                                 |
| DELETE | `/api/products/:id`             | delete product (blocked if referenced)         |
| GET    | `/api/stock`                    | list stock (`?low=1` for low stock only)       |
| GET    | `/api/stock/:id`                | one stock item                                 |
| POST   | `/api/stock`                    | create stock item                              |
| PUT    | `/api/stock/:id`                | update stock item                              |
| DELETE | `/api/stock/:id`                | delete stock item                              |
| GET    | `/api/customers`                | list customers (with `state_name`, `amount_due`) |
| GET    | `/api/customers/:id`            | one customer                                   |
| GET    | `/api/customers/:id/orders`     | a customer's orders and invoices               |
| POST   | `/api/customers`                | create customer                                |
| PUT    | `/api/customers/:id`            | update customer                                |
| DELETE | `/api/customers/:id`            | delete customer (blocked if has orders)        |
| GET    | `/api/quotations`               | list quotations (`?status=`)                   |
| GET    | `/api/quotations/:id`           | one quotation incl. line items                 |
| POST   | `/api/quotations`               | create quotation                               |
| PUT    | `/api/quotations/:id`           | update quotation (and items if supplied)       |
| PATCH  | `/api/quotations/:id/status`    | change quotation status                        |
| POST   | `/api/quotations/:id/convert`   | convert to a sales order                       |
| DELETE | `/api/quotations/:id`           | delete quotation (blocked once converted)      |
| GET    | `/api/orders`                   | list orders (`?status=` `?supply_type=`)       |
| GET    | `/api/orders/:id`               | order detail incl. line items                  |
| POST   | `/api/orders`                   | create order with items                        |
| PUT    | `/api/orders/:id`               | update order (and items if supplied)           |
| PATCH  | `/api/orders/:id/status`        | change order status                            |
| PATCH  | `/api/orders/:id/payment`       | change payment status                          |
| DELETE | `/api/orders/:id`               | delete order                                   |
| GET    | `/api/invoices`                 | list invoices (`?status=` `?customer_id=`)     |
| GET    | `/api/invoices/pending`         | open receivables with ageing buckets           |
| GET    | `/api/invoices/:id`             | one invoice incl. items and payments           |
| POST   | `/api/invoices`                 | create invoice from an order (reduces stock)   |
| POST   | `/api/invoices/:id/payments`    | record a receipt (also posts to the ledger)    |
| POST   | `/api/invoices/:id/e-invoice`   | generate demo IRN                              |
| POST   | `/api/invoices/:id/e-way-bill`  | generate demo e-way bill                       |
| DELETE | `/api/invoices/:id`             | delete invoice (blocked if it has payments)    |
| GET    | `/api/lots`                     | list lots (`?status=`)                         |
| GET    | `/api/lots/:id`                 | one lot                                        |
| POST   | `/api/lots`                     | create lot                                     |
| POST   | `/api/lots/:id/advance`         | move lot to the next status                    |
| PUT    | `/api/lots/:id`                 | update lot                                     |
| DELETE | `/api/lots/:id`                 | delete lot (and its quality checks)            |
| GET    | `/api/quality-checks`           | list checks (`?grade=` `?result=`)             |
| GET    | `/api/quality-checks/:id`       | one check                                      |
| POST   | `/api/quality-checks`           | create check                                   |
| DELETE | `/api/quality-checks/:id`       | delete check                                   |
| GET    | `/api/technical-visits`         | list visits (`?status=`)                       |
| GET    | `/api/technical-visits/:id`     | one visit                                      |
| POST   | `/api/technical-visits`         | create visit                                   |
| PUT    | `/api/technical-visits/:id`     | update visit                                   |
| DELETE | `/api/technical-visits/:id`     | delete visit                                   |
| GET    | `/api/seller`                   | seller profile (GSTIN, state code)             |
| PUT    | `/api/seller/:id`               | update seller profile                          |
| GET    | `/api/income-expenses`          | ledger (`?type=`) with running balance         |
| GET    | `/api/income-expenses/:id`      | one entry                                      |
| POST   | `/api/income-expenses`          | create entry                                   |
| PUT    | `/api/income-expenses/:id`      | update entry                                   |
| DELETE | `/api/income-expenses/:id`      | delete entry                                   |
| GET    | `/api/reports/sales-over-time`  | monthly sales (cancelled excluded)             |
| GET    | `/api/reports/profit-by-month`  | monthly revenue, cost, profit                  |
| GET    | `/api/reports/stock-by-product` | closing quantity per chemical per place        |
| GET    | `/api/reports/orders-by-status` | order count per status                         |
| GET    | `/api/reports/invoices-by-status` | invoice count and outstanding per status     |
| GET    | `/api/reports/income-expense-by-month` | ledger income/expenses/profit, last 6 months |
| GET    | `/api/reports/salary-this-month` | total salary expense in the current month      |
| GET    | `/api/reports/pending-payments` | outstanding and overdue totals for the tile    |
| GET    | `/api/reports/orders-today`     | today's order count and value for the tile     |
| GET    | `/api/reports/pending-approval` | orders awaiting approval, for the tile         |

---

## Database schema (16 tables)

- **products** — `id, code, name, hsn_code, unit, brand, purchase_price, selling_price,
  gst_rate, reorder_level`
- **customers** — `id, name, phone, location, customer_type, gstin, state_code`
- **quotations** / **quotation_items** — `quotation_no, customer_id, quote_date,
  valid_until, status, total_amount, notes, converted_order_id` + `product_id, quantity,
  unit_price, unit_cost`
- **orders** / **order_items** — `order_no, customer_id, supply_type, order_date, status,
  payment_status, total_amount, delivery_date, vehicle_number` + `product_id, quantity,
  unit_price, unit_cost`
- **invoices** / **invoice_items** / **invoice_payments** — `invoice_no, order_id,
  customer_id, invoice_date, due_date, status, place_of_supply, seller_gstin, buyer_gstin,
  subtotal, cgst, sgst, igst, total_amount, amount_paid, amount_due, amount_in_words, irn,
  eway_bill` + `product_id, hsn_code, description, unit, quantity, rate, taxable_value,
  gst_rate, tax_amount` + `payment_date, amount, mode, note`
- **stock_items** — `id, product_id, item_name, quantity, unit, warehouse`
- **lots** — `id, lot_no, product_id, supplier, received_date, expiry_date, quantity, status,
  warehouse, linked_order_id`
- **quality_checks** — `id, lot_id, grade, inspector_name, inspection_date, pass_fail, notes`
- **technical_visits** — `id, customer_id, visit_date, engineer, issue, solution_given,
  follow_up_date, status`
- **income_expenses** — `id, entry_date, type, category, amount, note, invoice_id`
- **seller_profile** — `id, business_name, address, city, district, state, state_code, gstin,
  phone, email, is_sample`

`low_stock` is computed (`quantity < reorder_level`) and returned by the API, not stored.
HSN code, unit and GST rate are **snapshotted onto each invoice line** so a later product
change never rewrites an already-issued tax document.

`init.js` is idempotent and also carries the upgrade statements that converted an earlier
footwear-era database (styles → chemicals, batches → lots, export orders → domestic supply),
so the demo converges on one schema whether it is fresh or being migrated.

---

## Seed data

`node seed.js` loads a realistic snapshot (verified by `check_seed.cjs`): a seller profile
for Surya Tech in Tamil Nadu (state code 33), leather chemicals with HSN codes and GST rates,
tanneries and merchants across several states, quotations, orders, invoices with CGST/SGST
and IGST examples, partial payments, supplier lots, technical visits and ledger entries.

---

## Assumptions (ASSUMPTION-NEEDED)

These were the points that were not fully specified; each has a matching
`// ASSUMPTION-NEEDED:` comment in the code. They are the decisions to revisit with the
business before any real build.

1. **Deleting a customer with orders is blocked** (`routes/customers.js`). Deleting them
   would orphan their orders; a real build must choose between *block* (current) and
   *soft archive*.
2. **Deleting a product that is referenced is blocked** (`routes/products.js`). A chemical
   used by order items, quotation items, invoice items, lots or stock cannot be deleted.
3. **Deleting an order keeps its lots but unlinks them**, and removes the quality checks
   belonging to those lots (`routes/orders.js`).
4. **Order pricing is entered manually per line** — there is no automatic bulk discount off
   the product selling price (`routes/orders.js`).
5. **Order status is not forward-only** — any valid status can be set at any time, including
   moving backwards or cancelling (`routes/orders.js`).
6. **Cancelled orders are excluded from sales and profit aggregates** so they do not inflate
   revenue (`routes/reports.js`).
7. **A quotation can only be converted when it is Sent or Accepted**, so a draft never
   reaches dispatch by accident; converting marks it Accepted and links the order
   (`routes/quotations.js`).
8. **The dashboard "Monthly Income & Profit" chart is ledger-based** — income/expenses/profit
   come from `income_expenses` (so salaries and rent are included), *not* from order sales
   (`routes/reports.js`). "Last 6 months" means the 6 most recent months that have entries.
9. **Salary tile = total monthly salary spend**, i.e. `income_expenses` rows with
   `type='Expense'` and a `category` containing "Salary" for the current month — not an
   employee headcount (`routes/reports.js`).
10. **"Current month" uses the server's system date** (`routes/reports.js`).
11. **Receivable ageing is measured from the due date**, so the `0-30` bucket contains
    everything not yet overdue as well as the first 30 days late (`routes/invoices.js`).
12. **Invoices carry 30 days credit** unless a due date is given at creation
    (`routes/invoices.js`).
13. **e-invoice IRN and e-way bill are generated locally** by `services/gstPortal.js` for the
    demo; nothing is sent to the GST portal, and the UI says so on every generated document.
14. **The dashboard chart uses a `ComposedChart`** (income/expense bars + a profit line),
    since the spec allowed either line or bar (`modules/Dashboard.jsx`).
15. **The dashboard has five stat tiles** — the four the business already tracked plus the
    new Pending Payments tile (`modules/Dashboard.jsx`).
16. **The Quality screen is kept in the API but hidden from the navigation**, because each
    supplier lot is still inspected before it is issued to a customer
    (`routes/quality.js`).

---

## Verifying the build

From `backend/`:

```
npm run verify       # route-level checks
node verify.js       # tables + expected columns
node check_seed.cjs  # seed row counts + referential integrity
node e2e_verify.cjs  # end-to-end flow check (frontend dist + API)
```

From `frontend/`:

```
npm run build        # production bundle
```

All backend checks need `DATABASE_URL` set (a `.env` file, or `$env:DATABASE_URL` on
Windows PowerShell); the frontend build needs only npm.

---

## Deployment (Render + Supabase)

- **Database** — create a Supabase project, grab its pooler/project connection string and
  set it as the backend's `DATABASE_URL`. Run `npm run seed` once against that database.
- **Backend** — a Render Web Service: build command `npm install`, start command
  `npm start`, env var `DATABASE_URL`. It listens on `PORT` (Render injects it).
- **Frontend** — a Render Static Site: build command `npm install && npm run build`,
  publish directory `dist`, plus the `VITE_API_URL` env var pointing at the backend URL.
  Add an `api` rewrite/redirect so `/api/*` hits the backend (or serve the SPA from the
  backend itself).

---

## Notes / not included

- **No authentication or user roles** — it is a single-user local demo. Server-side auth
  and permissions are the next thing to add for real use.
- **No cloud services, no paid APIs, no external calls** besides the hosted Postgres
  database itself. Data lives in the configured database (Supabase by default).
- Currency is shown in Indian Rupees (₹) with `en-IN` formatting, and dates in
  `DD MMM YYYY` for display while staying `YYYY-MM-DD` in storage.
- All colors and type come from `src/theme.css` tokens; screens carry no inline colors.
- `recharts` 2.x prints an upstream deprecation notice on install suggesting v3; this demo
  intentionally stays on the 2.x line.
