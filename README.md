# Leather Stylish — Business Management Demo

A local demo web app for **Leather Stylish**, a leather-footwear manufacturer in Ambur,
Tamil Nadu. It covers the day-to-day operations of the business — products, stock,
customers, orders (including export shipments), production batches, quality checks,
income/expenses and reports — behind a responsive React UI and a small Express + SQLite API.

This is a **demo**, not a production system: it runs entirely on your machine, has no
authentication, and uses a seeded SQLite database.

---

## Tech stack

| Layer     | Choice                                             |
| --------- | -------------------------------------------------- |
| Frontend  | React 18 (functional components + hooks), Vite 6   |
| Charts    | Recharts 2                                         |
| Backend   | Node.js + Express 4                                |
| Database  | SQLite via better-sqlite3                          |
| Styling   | Plain CSS (responsive, no UI framework)            |

---

## Project structure

```
lether campany/
├─ backend/
│  ├─ server.js              # Express app, mounts all routes, listens on 3001
│  ├─ db.js                  # SQLite connection (WAL, foreign_keys ON)
│  ├─ init.js                # creates the 8 tables
│  ├─ seed.js                # inserts sample data
│  ├─ verify.js              # checks the schema columns
│  ├─ check_seed.cjs         # checks seeded row counts + integrity
│  ├─ route_verify.cjs       # in-process checks for all 8 route modules
│  ├─ e2e_verify.cjs         # end-to-end flow check (serves frontend + API)
│  ├─ database/data.db       # SQLite database file (created on first run)
│  └─ routes/
│     ├─ products.js  ├─ stock.js      ├─ customers.js  ├─ orders.js
│     ├─ batches.js   ├─ quality.js    ├─ ledger.js      └─ reports.js
└─ frontend/
   ├─ vite.config.js         # dev server on 5173, proxies /api -> 3001
   └─ src/
      ├─ App.jsx             # shell + responsive navigation
      ├─ index.css           # all styling
      └─ modules/            # Dashboard, Products, Stock, Customers, Orders,
                             # Batches, Quality, Ledger, Reports
```

---

## Getting started

Prerequisites: **Node.js 18+** (developed on Node 24) and npm.

### 1. Backend

```
cd backend
npm install
npm run seed        # (re)create tables and load sample data (idempotent)
npm start           # http://localhost:3001
```

`npm start` runs `node server.js`. It creates `database/data.db` and the tables if they
do not exist. `npm run seed` loads the sample data and is safe to re-run.

### 2. Frontend

```
cd frontend
npm install
npm run dev         # http://localhost:5173
```

Open **http://localhost:5173**. The Vite dev server proxies all `/api/*` calls to the
backend on port 3001, so both must be running.

To produce a static build: `npm run build` (output in `frontend/dist`).

---

## Modules

1. **Dashboard** — cards for today's new orders, pending-approval %, low-stock count and
   pending export orders.
2. **Products** — product master (code, name, price, sizes, sole type) with add/edit/delete.
3. **Stock Management** — raw material and finished stock, low-stock flag, "low stock only"
   filter.
4. **Customers** — wholesale / export / retail accounts with add/edit/delete.
5. **Orders** — sales orders with line items, live status and payment-status updates,
   and full shipment/export fields (country, ship date, method, tracking ref).
6. **Batches** — production batches tracked through
   *Cutting → Stitching → Finishing → Quality Check → Packed*, with one-click advance.
7. **Quality Checks** — inspection per batch with grade (Export Grade / Local Grade A /
   Local Grade B), inspector, date, pass/fail and notes.
8. **Income & Expenses** — cash ledger with total income, total expense, net and a
   running balance per row.
9. **Reports** — four charts: Sales Over Time, Profit by Month, Stock by Style,
   Orders by Status.

The layout is responsive: a fixed sidebar on screens ≥ 992 px and a bottom navigation
bar on smaller screens.

---

## API reference

Base URL: `http://localhost:3001`

| Method | Endpoint                        | Purpose                                   |
| ------ | ------------------------------- | ----------------------------------------- |
| GET    | `/api/health`                   | health check                              |
| GET    | `/api/products`                 | list products                             |
| GET    | `/api/products/:id`             | one product                               |
| POST   | `/api/products`                 | create product                            |
| PUT    | `/api/products/:id`             | update product                            |
| DELETE | `/api/products/:id`             | delete product (blocked if referenced)    |
| GET    | `/api/stock`                    | list stock (`?low=1` for low stock only)  |
| GET    | `/api/stock/:id`                | one stock item                            |
| POST   | `/api/stock`                    | create stock item                         |
| PUT    | `/api/stock/:id`                | update stock item                         |
| DELETE | `/api/stock/:id`                | delete stock item                         |
| GET    | `/api/customers`                | list customers                            |
| GET    | `/api/customers/:id`            | one customer                              |
| GET    | `/api/customers/:id/orders`     | a customer's orders                       |
| POST   | `/api/customers`                | create customer                           |
| PUT    | `/api/customers/:id`            | update customer                           |
| DELETE | `/api/customers/:id`            | delete customer (blocked if has orders)   |
| GET    | `/api/orders`                   | list orders (`?status=` `?order_type=`)   |
| GET    | `/api/orders/:id`               | order detail incl. line items             |
| POST   | `/api/orders`                   | create order with items                   |
| PUT    | `/api/orders/:id`               | update order (and items if supplied)      |
| PATCH  | `/api/orders/:id/status`        | change order status                       |
| PATCH  | `/api/orders/:id/payment`       | change payment status                     |
| DELETE | `/api/orders/:id`               | delete order                              |
| GET    | `/api/batches`                  | list batches (`?stage=`)                  |
| GET    | `/api/batches/:id`              | one batch                                 |
| POST   | `/api/batches`                  | create batch                              |
| POST   | `/api/batches/:id/advance`      | move batch to the next stage              |
| PUT    | `/api/batches/:id`              | update batch                              |
| DELETE | `/api/batches/:id`              | delete batch (and its quality checks)     |
| GET    | `/api/quality-checks`           | list checks (`?grade=` `?result=`)        |
| GET    | `/api/quality-checks/:id`       | one check                                 |
| POST   | `/api/quality-checks`           | create check                              |
| DELETE | `/api/quality-checks/:id`       | delete check                              |
| GET    | `/api/income-expenses`          | ledger (`?type=`) with running balance    |
| GET    | `/api/income-expenses/:id`      | one entry                                 |
| POST   | `/api/income-expenses`          | create entry                              |
| PUT    | `/api/income-expenses/:id`      | update entry                              |
| DELETE | `/api/income-expenses/:id`      | delete entry                              |
| GET    | `/api/reports/sales-over-time`  | monthly sales (cancelled excluded)        |
| GET    | `/api/reports/profit-by-month`  | monthly revenue, cost, profit             |
| GET    | `/api/reports/stock-by-style`   | finished pairs per style                  |
| GET    | `/api/reports/orders-by-status` | order count per status                    |
| GET    | `/api/reports/income-expense-by-month` | ledger income/expenses/profit, last 6 months |
| GET    | `/api/reports/salary-this-month` | total salary expense in the current month |

---

## Database schema (8 tables)

- **products** — `id, code, name, price, sizes_available, sole_type`
- **customers** — `id, name, phone, location, customer_type`
- **orders** — `id, customer_id, order_type, order_date, status, payment_status,
  total_amount, is_export, export_country, shipment_date, shipping_method, tracking_ref`
- **order_items** — `id, order_id, product_id, size, quantity, unit_price, unit_cost`
- **batches** — `id, batch_code, product_id, quantity, start_date,
  expected_completion_date, stage, linked_order_id`
- **stock_items** — `id, item_name, item_type, product_id, size, quantity, unit,
  reorder_threshold`
- **quality_checks** — `id, batch_id, grade, inspector_name, inspection_date, pass_fail,
  notes`
- **income_expenses** — `id, entry_date, type, category, amount, note`

`low_stock` is computed (`quantity < reorder_threshold`) and returned by the API, not stored.

---

## Seed data

`node seed.js` loads a realistic snapshot (verified by `check_seed.cjs`):

- 8 products (styles LS1–LS8; LS1 priced ₹1,499, others ₹999)
- 5 customers (wholesale, export and retail, around Ambur / Chennai / Ranipet / Vellore)
- 6 orders, including one export order to the UAE (Sea Freight, tracking `APL-77123-IND`)
  and one cancelled order
- 3 production batches at different stages
- 9 stock items (raw material + finished stock), including 4 at/under reorder level
- 2 quality checks
- 8 ledger entries across Aug–Sep 2026

---

## Assumptions (ASSUMPTION-NEEDED)

These were the points that were not fully specified; each has a matching
`// ASSUMPTION-NEEDED:` comment in the code. They are the decisions to revisit with the
business before any real build.

1. **Deleting a customer with orders is blocked** (`routes/customers.js`). Deleting them
   would orphan their orders; a real build must choose between *block* (current) and
   *soft archive*.
2. **Deleting a product that is referenced is blocked** (`routes/products.js`). A product
   used by order items, batches or finished stock cannot be deleted.
3. **Deleting an order keeps its batches but unlinks them**, and removes the quality checks
   belonging to those batches (`routes/orders.js`).
4. **Order pricing is entered manually per line** — there is no automatic wholesale
   discount off the product list price (`routes/orders.js`).
5. **Order status is not forward-only** — any valid status can be set at any time, including
   moving backwards or cancelling (`routes/orders.js`).
6. **Cancelled orders are excluded from sales and profit aggregates** so they do not inflate
   revenue (`routes/reports.js`).
7. **The dashboard "Monthly Income & Profit" chart is ledger-based** — income/expenses/profit
   come from `income_expenses` (so salaries and rent are included), *not* from order sales
   (`routes/reports.js`). "Last 6 months" means the 6 most recent months that have entries.
8. **Salary tile = total monthly salary spend**, i.e. `income_expenses` rows with
   `type='Expense'` and a `category` containing "Salary" for the current month — not an
   employee headcount (`routes/reports.js`).
9. **"Current month" uses the server's system date** (`routes/reports.js`).
10. **The dashboard chart uses a `ComposedChart`** (income/expense bars + a profit line),
    since the spec allowed either line or bar (`modules/Dashboard.jsx`).
11. **The "sixth stat tile alongside the existing four"** was read as *one new tile* (five
    total) because there are exactly four existing tiles (`modules/Dashboard.jsx`).

---

## Verifying the build

From `backend/`:

```
node verify.js          # 8 tables + expected columns
node check_seed.cjs     # seed row counts + referential integrity
node route_verify.cjs   # 32 API checks across all 8 route modules
node e2e_verify.cjs     # 15-check end-to-end flow (frontend dist + API)
```

From `frontend/`:

```
npm run build           # production bundle
```

All of the above currently pass.

---

## Notes / not included

- **No authentication or user roles** — it is a single-user local demo. Server-side auth
  and permissions are the next thing to add for real use.
- **No cloud services, no paid APIs, no external calls.** Data stays in the local SQLite file.
- Currency is shown in Indian Rupees (₹) with `en-IN` formatting.
- `recharts` 2.x prints an upstream deprecation notice on install suggesting v3; this demo
  intentionally stays on the 2.x line.
