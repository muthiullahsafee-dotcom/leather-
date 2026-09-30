// The Surya Tech demo dataset, in one plain-data module.
//
// Everything here is fictional: no real company, GSTIN, phone number or supplier.
// Dates are not hardcoded — the seed resolves them relative to the day it runs, so
// the dashboard's "today" tile, the 6-month ledger and the invoice ageing always line
// up whenever the demo is installed (see seed.js for the date helpers).
//
// The dataset is exported as data, not as insert statements, so `verify_seed.cjs` can
// assert every invariant in this file (low-stock count, ageing buckets, GST split,
// monthly profit, invoice totals) with no database connection.

// ─── Products ────────────────────────────────────────────────────────────────────
// Leather chemicals sold to tanneries. All GST 18%, all Kg or Litre.
// `openingStock` is the quantity held before the seeded invoices are raised; the
// four marked `low: true` sit below their reorder level and stay below after
// invoicing, which is what keeps the dashboard's Low Stock tile at exactly 4.
const PRODUCTS = [
  { code: 'CHM-001', name: 'Chrome Tanning Salt (Basic Chromium Sulphate)', unit: 'Kg', hsn: '2833', purchase: 78, selling: 92, reorder: 1000, openingStock: 2400, brand: 'Domestic' },
  { code: 'CHM-002', name: 'Sodium Sulphide Flakes', unit: 'Kg', hsn: '2830', purchase: 38, selling: 48, reorder: 800, openingStock: 1500, brand: 'Domestic' },
  { code: 'CHM-003', name: 'Formic Acid 85%', unit: 'Kg', hsn: '2915', purchase: 62, selling: 76, reorder: 500, openingStock: 900, brand: 'Domestic' },
  { code: 'CHM-004', name: 'Ammonium Sulphate', unit: 'Kg', hsn: '3102', purchase: 14, selling: 19, reorder: 500, openingStock: 1200, brand: 'Domestic' },
  { code: 'CHM-005', name: 'Sodium Bicarbonate', unit: 'Kg', hsn: '2836', purchase: 26, selling: 34, reorder: 400, openingStock: 320, brand: 'Domestic', low: true },
  { code: 'CHM-006', name: 'Bating Enzyme', unit: 'Kg', hsn: '3507', purchase: 210, selling: 260, reorder: 200, openingStock: 480, brand: 'Imported' },
  { code: 'CHM-007', name: 'Degreasing Agent', unit: 'Litre', hsn: '3402', purchase: 95, selling: 122, reorder: 300, openingStock: 640, brand: 'Own brand' },
  { code: 'CHM-008', name: 'Wetting Agent', unit: 'Litre', hsn: '3402', purchase: 82, selling: 105, reorder: 200, openingStock: 150, brand: 'Own brand', low: true },
  { code: 'CHM-009', name: 'Phenolic Syntan', unit: 'Kg', hsn: '3202', purchase: 74, selling: 96, reorder: 600, openingStock: 1400, brand: 'Own brand' },
  { code: 'CHM-010', name: 'Retanning Resin', unit: 'Kg', hsn: '3202', purchase: 118, selling: 148, reorder: 400, openingStock: 750, brand: 'Imported' },
  { code: 'CHM-011', name: 'Synthetic Fatliquor', unit: 'Litre', hsn: '3403', purchase: 105, selling: 135, reorder: 500, openingStock: 420, brand: 'Own brand', low: true },
  { code: 'CHM-012', name: 'Acid Black Dye', unit: 'Kg', hsn: '3204', purchase: 310, selling: 385, reorder: 100, openingStock: 240, brand: 'Imported' },
  { code: 'CHM-013', name: 'Acid Brown Dye', unit: 'Kg', hsn: '3204', purchase: 330, selling: 410, reorder: 100, openingStock: 85, brand: 'Imported', low: true },
  { code: 'CHM-014', name: 'Pigment Binder', unit: 'Litre', hsn: '3906', purchase: 140, selling: 178, reorder: 300, openingStock: 560, brand: 'Own brand' },
  { code: 'CHM-015', name: 'Top-Coat Lacquer', unit: 'Litre', hsn: '3208', purchase: 260, selling: 325, reorder: 150, openingStock: 380, brand: 'Imported' }
];

// ─── Seller profile ─────────────────────────────────────────────────────────────
// The demo's own selling entity. isSample flags it as fictional for the GST screens.
const SELLER = {
  business_name: 'Surya Tech',
  address: '14/2, Katpatti Street, Vaniyambadi',
  city: 'Vaniyambadi',
  district: 'Tirupattur District',
  state: 'Tamil Nadu',
  state_code: '33',
  gstin: '33AAAAA0000A1Z5',
  phone: '+91 90031 00000',
  email: 'sales@suryatech.example',
  is_sample: 1
};

// ─── Customers ──────────────────────────────────────────────────────────────────
// Tanneries and leather traders. The two buyers outside Tamil Nadu (Kanpur, Kolkata)
// exist so the demo can show IGST on an inter-state invoice next to CGST + SGST on an
// intra-state one. GSTINs are sequential dummies and are not registered anywhere.
// creditTerms drives the invoice due date (see routes/invoices.js).
const CUSTOMERS = [
  { name: 'Al-Hamd Leather Works',        phone: '+91 90031 00101', location: 'Vaniyambadi, Tamil Nadu',           customer_type: 'Tannery',   gstin: '33AAAAA0001A1Z5', state_code: '33', creditTerms: 30 },
  { name: 'Star Tanning Industries',      phone: '+91 90031 00102', location: 'Ambur, Tamil Nadu',                 customer_type: 'Tannery',   gstin: '33AAAAA0002A1Z5', state_code: '33', creditTerms: 30 },
  { name: 'Royal Hides Processing',       phone: '+91 90031 00103', location: 'Ranipet, Tamil Nadu',               customer_type: 'Tannery',   gstin: '33AAAAA0003A1Z5', state_code: '33', creditTerms: 45 },
  { name: 'Nawaz Leather Finishers',      phone: '+91 90031 00104', location: 'Pernambut, Tamil Nadu',             customer_type: 'Tannery',   gstin: '33AAAAA0004A1Z5', state_code: '33', creditTerms: 30 },
  { name: 'Sri Murugan Tanners',          phone: '+91 90031 00105', location: 'Vellore, Tamil Nadu',               customer_type: 'Tannery',   gstin: '33AAAAA0005A1Z5', state_code: '33', creditTerms: 30 },
  { name: 'Crescent Leather Co.',         phone: '+91 90031 00106', location: 'Vaniyambadi, Tamil Nadu',           customer_type: 'Wholesale', gstin: '33AAAAA0006A1Z5', state_code: '33', creditTerms: 30 },
  { name: 'Golden Crust Leathers',        phone: '+91 90031 00107', location: 'Chennai, Tamil Nadu',               customer_type: 'Tannery',   gstin: '33AAAAA0007A1Z5', state_code: '33', creditTerms: 45 },
  { name: 'Ambur Prime Tanneries',        phone: '+91 90031 00108', location: 'Ambur, Tamil Nadu',                 customer_type: 'Tannery',   gstin: '33AAAAA0008A1Z5', state_code: '33', creditTerms: 15 },
  { name: 'Ganga Leather Processors',     phone: '+91 90031 00109', location: 'Kanpur, Uttar Pradesh',             customer_type: 'Tannery',   gstin: '09AAAAA0009A1Z5', state_code: '09', creditTerms: 15 },
  { name: 'Eastern Hide Traders',         phone: '+91 90031 00110', location: 'Kolkata, West Bengal',              customer_type: 'Wholesale', gstin: '19AAAAA0010A1Z5', state_code: '19', creditTerms: 15 }
];

// ─── Lots (supplier deliveries) ─────────────────────────────────────────────────
// Roughly one lot per chemical that is bought in drums or bags. Quantities here are
// the consignment received, not the stock on hand, so they do not affect the
// Low Stock tile.
const LOTS = [
  { product: 'CHM-001', supplier: 'Kovai Chemical Traders',        receivedDaysAgo: 120, expiryMonths: 24, quantity: 600,  status: 'In Stock',     warehouse: 'Warehouse' },
  { product: 'CHM-002', supplier: 'Annamalai Agro Supplies',      receivedDaysAgo: 112, expiryMonths: 24, quantity: 450,  status: 'In Stock',     warehouse: 'Warehouse' },
  { product: 'CHM-003', supplier: 'Coromandel Acid Distributors', receivedDaysAgo: 104, expiryMonths: 18, quantity: 300,  status: 'In Stock',     warehouse: 'Warehouse' },
  { product: 'CHM-004', supplier: 'Southern Agri Inputs',         receivedDaysAgo: 98,  expiryMonths: 24, quantity: 700,  status: 'In Stock',     warehouse: 'Warehouse' },
  { product: 'CHM-005', supplier: 'Kovai Chemical Traders',        receivedDaysAgo: 90,  expiryMonths: 24, quantity: 250,  status: 'In Stock',     warehouse: 'Admin Office' },
  { product: 'CHM-006', supplier: 'Metro Enzyme Technologies',    receivedDaysAgo: 82,  expiryMonths: 12, quantity: 90,   status: 'In Stock',     warehouse: 'Warehouse' },
  { product: 'CHM-007', supplier: 'Pennyserv Surfactants',        receivedDaysAgo: 76,  expiryMonths: 18, quantity: 220,  status: 'In Stock',     warehouse: 'Warehouse' },
  { product: 'CHM-008', supplier: 'Surya Tech (own brand)',       receivedDaysAgo: 70,  expiryMonths: 18, quantity: 110,  status: 'In Stock',     warehouse: 'Admin Office' },
  { product: 'CHM-009', supplier: 'Coromandel Syntan Works',      receivedDaysAgo: 64,  expiryMonths: 24, quantity: 500,  status: 'In Stock',     warehouse: 'Warehouse' },
  { product: 'CHM-010', supplier: 'Chennai Resin Industries',     receivedDaysAgo: 58,  expiryMonths: 18, quantity: 300,  status: 'In Stock',     warehouse: 'Warehouse' },
  { product: 'CHM-011', supplier: 'Surya Tech (own brand)',       receivedDaysAgo: 52,  expiryMonths: 15, quantity: 180,  status: 'Partly Issued', warehouse: 'Warehouse' },
  { product: 'CHM-012', supplier: 'Metro Pigments & Dyes',        receivedDaysAgo: 46,  expiryMonths: 12, quantity: 90,   status: 'In Stock',     warehouse: 'Admin Office' },
  { product: 'CHM-013', supplier: 'Metro Pigments & Dyes',        receivedDaysAgo: 40,  expiryMonths: 12, quantity: 60,   status: 'In Stock',     warehouse: 'Warehouse' },
  { product: 'CHM-014', supplier: 'Surya Tech (own brand)',       receivedDaysAgo: 34,  expiryMonths: 15, quantity: 200,  status: 'In Stock',     warehouse: 'Warehouse' },
  { product: 'CHM-015', supplier: 'Chennai Resin Industries',     receivedDaysAgo: 28,  expiryMonths: 18, quantity: 160,  status: 'In Stock',     warehouse: 'Warehouse' }
];

// ─── Quotations ─────────────────────────────────────────────────────────────────
// A quote becomes an order only when it is accepted, so `convertToOrder` links the
// Accepted quotation to the order that superseded it. Draft/Rejected quotes never
// touch stock or receivables.
const QUOTATIONS = [
  {
    customer: 'Al-Hamd Leather Works', daysAgo: 34, status: 'Draft',
    notes: 'Revised rates requested for the chrome salt annual contract.',
    items: [['CHM-001', 250, 92], ['CHM-006', 60, 260]]
  },
  {
    customer: 'Royal Hides Processing', daysAgo: 26, status: 'Sent',
    notes: 'Rates hold for 15 days from the quote date.',
    items: [['CHM-009', 300, 96], ['CHM-010', 100, 148]]
  },
  {
    customer: 'Golden Crust Leathers', daysAgo: 19, status: 'Accepted', convertToOrder: 'o9',
    notes: 'Accepted against the pigment binder trial result.',
    items: [['CHM-014', 120, 178], ['CHM-006', 100, 260]]
  },
  {
    customer: 'Crescent Leather Co.', daysAgo: 12, status: 'Rejected',
    notes: 'Customer went with a local supplier on price.',
    items: [['CHM-005', 400, 34], ['CHM-002', 200, 48]]
  },
  {
    customer: 'Sri Murugan Tanners', daysAgo: 4, status: 'Sent',
    notes: 'Inter-state enquiry pending confirmation of the consignee GSTIN.',
    items: [['CHM-007', 150, 122], ['CHM-014', 120, 178]]
  }
];

// ─── Orders ─────────────────────────────────────────────────────────────────────
// Twelve orders across the last two months. Exactly one is still 'Pending Approval'
// and exactly one is dated today (o12, which is that same order). The ten oldest are
// invoiced; o11 is left Confirmed and o12 Pending Approval so "Create Invoice" has
// something to act on and the Pending Payments screen keeps a live receivable.
//
// Who a customer is matters for ageing as much as the date: an order falls overdue
// once `daysAgo` exceeds that buyer's credit terms plus the four-day delivery gap.
// The three oldest orders are placed with the buyers on 15-day terms, so they land at
// 39, 33 and 28 days past due, and every later order is kept inside its terms. That
// leaves exactly three overdue invoices and spreads them across two ageing buckets.
//
// `items` quantities are sized so that raising all ten invoices leaves exactly the
// four chemicals marked `low` below their reorder level.
const ORDERS = [
  { key: 'o1',  customer: 'Ganga Leather Processors', daysAgo: 58, status: 'Delivered',        supply_type: 'Bulk',   items: [['CHM-010', 150, 148], ['CHM-014', 100, 178]] },
  { key: 'o2',  customer: 'Eastern Hide Traders',     daysAgo: 52, status: 'Delivered',        supply_type: 'Bulk',   items: [['CHM-007', 150, 122], ['CHM-003', 150, 76]] },
  { key: 'o3',  customer: 'Ambur Prime Tanneries',    daysAgo: 47, status: 'Delivered',        supply_type: 'Bulk',   items: [['CHM-001', 250, 92], ['CHM-012', 45, 385]] },
  { key: 'o4',  customer: 'Royal Hides Processing',   daysAgo: 41, status: 'Delivered',        supply_type: 'Bulk',   items: [['CHM-006', 120, 260], ['CHM-009', 180, 96]] },
  { key: 'o5',  customer: 'Al-Hamd Leather Works',    daysAgo: 30, status: 'Delivered',        supply_type: 'Bulk',   items: [['CHM-011', 150, 135], ['CHM-004', 120, 19]] },
  { key: 'o6',  customer: 'Star Tanning Industries',  daysAgo: 26, status: 'Delivered',        supply_type: 'Bulk',   items: [['CHM-005', 250, 34], ['CHM-002', 150, 48]] },
  { key: 'o7',  customer: 'Crescent Leather Co.',     daysAgo: 14, status: 'Delivered',        supply_type: 'Retail', items: [['CHM-012', 40, 385], ['CHM-013', 30, 410]] },
  { key: 'o8',  customer: 'Sri Murugan Tanners',      daysAgo: 20, status: 'Dispatched',       supply_type: 'Bulk',   items: [['CHM-015', 100, 325], ['CHM-009', 130, 96]] },
  { key: 'o9',  customer: 'Golden Crust Leathers',    daysAgo: 16, status: 'Dispatched',       supply_type: 'Bulk',   items: [['CHM-014', 120, 178], ['CHM-006', 100, 260]] },
  { key: 'o10', customer: 'Royal Hides Processing',   daysAgo: 10, status: 'Dispatched',       supply_type: 'Bulk',   items: [['CHM-003', 120, 76], ['CHM-007', 120, 122]] },
  { key: 'o11', customer: 'Nawaz Leather Finishers',  daysAgo: 5,  status: 'Confirmed',        supply_type: 'Bulk',   items: [['CHM-008', 60, 105], ['CHM-013', 40, 410]] },
  { key: 'o12', customer: 'Al-Hamd Leather Works',    daysAgo: 0,  status: 'Pending Approval', supply_type: 'Bulk',   items: [['CHM-009', 250, 96], ['CHM-004', 300, 19]] }
];

// ─── Invoices ───────────────────────────────────────────────────────────────────
// One GST invoice per invoiced order (o1..o10). The invoice date is the order date
// plus four days (delivery), and the due date comes from the customer's own credit
// terms, so the ageing buckets are a consequence of the terms rather than a hardcoded
// number of "overdue" invoices.
//
// paid: 'full' | 'part' | 'none'. The three oldest (o1, o2, o3) fall outside their
// terms and are left open or partly open, which is what fills the 31-60 and 0-30
// buckets on the Pending Payments screen.
const INVOICES = [
  { order: 'o1',  daysAfterOrder: 4, paid: 'part', payDaysAfterInvoice: 8,  mode: 'NEFT' },
  { order: 'o2',  daysAfterOrder: 4, paid: 'none' },
  { order: 'o3',  daysAfterOrder: 4, paid: 'none' },
  { order: 'o4',  daysAfterOrder: 4, paid: 'full', payDaysAfterInvoice: 6,  mode: 'RTGS' },
  { order: 'o5',  daysAfterOrder: 4, paid: 'part', payDaysAfterInvoice: 5,  mode: 'NEFT' },
  { order: 'o6',  daysAfterOrder: 4, paid: 'full', payDaysAfterInvoice: 4,  mode: 'Cheque' },
  { order: 'o7',  daysAfterOrder: 4, paid: 'none' },
  { order: 'o8',  daysAfterOrder: 4, paid: 'part', payDaysAfterInvoice: 3,  mode: 'UPI' },
  { order: 'o9',  daysAfterOrder: 4, paid: 'full', payDaysAfterInvoice: 2,  mode: 'NEFT' },
  { order: 'o10', daysAfterOrder: 4, paid: 'none' }
];

// ─── Technical visits ───────────────────────────────────────────────────────────
// The consultancy half of the business. Status values match routes/visits.js
// ('Open' | 'Follow-up Due' | 'Resolved'); followUpOffset is relative to the visit
// date and is negative when the follow-up already happened.
const VISITS = [
  {
    customer: 'Al-Hamd Leather Works', daysAgo: 52, engineer: 'R. Karthikeyan',
    issue: 'Uneven dye uptake on the wet blue',
    solution: 'Adjusted the neutralisation pH to 4.2 and cut the dye dose to 2.5 g/L.',
    followUpOffset: -6, status: 'Resolved'
  },
  {
    customer: 'Star Tanning Industries', daysAgo: 41, engineer: 'S. Meenakshi',
    issue: 'Low chrome exhaustion in the spent liquor',
    solution: 'Revised the float ratio and brought the basification schedule forward by 30 minutes.',
    followUpOffset: 7, status: 'Follow-up Due'
  },
  {
    customer: 'Royal Hides Processing', daysAgo: 29, engineer: 'R. Karthikeyan',
    issue: 'Loose grain after retanning',
    solution: 'Reduced the syntan charge by a third and switched to a lighter fatliquor.',
    followUpOffset: -8, status: 'Resolved'
  },
  {
    customer: 'Nawaz Leather Finishers', daysAgo: 18, engineer: 'D. Venkatesh',
    issue: 'Top-coat peeling after two weeks of storage',
    solution: 'Changed the binder ratio to 3:1 and started a trial on 5 hides.',
    followUpOffset: 5, status: 'Follow-up Due'
  },
  {
    customer: 'Sri Murugan Tanners', daysAgo: 9, engineer: 'S. Meenakshi',
    issue: 'Slow unhairing in the drum',
    solution: 'Checked the sulphide dose against the lime addition; corrected the make-up sheet.',
    followUpOffset: 11, status: 'Follow-up Due'
  },
  {
    customer: 'Ganga Leather Processors', daysAgo: 2, engineer: 'D. Venkatesh',
    issue: 'Shade variation between lots (phone consult)',
    solution: 'Put the two lots on dye lot control with a single dissolved master batch.',
    followUpOffset: -3, status: 'Resolved'
  }
];

// ─── Cash ledger (last six months) ──────────────────────────────────────────────
// One entry per month per category, walked newest-first (index 0 is the current
// month). Income exceeds expenses in every month and each month's income lands
// between 3.5 and 6.5 lakh, which is what keeps the dashboard's six-month profit
// line above zero. This month's salary is 50,000 (the salary tile reads exactly this).
//
// `sales` is the month's total collection. For the current month seed.js splits it
// into the receipts on the seeded invoices (posted individually, linked by
// invoice_id) and one balancing "other collections" row, so the two always add up.
const LEDGER = [
  { sales: 420000, consulting: 65000, brokerage: 30000, purchase: 260000, salary: 50000, rent: 28000, transport: 23000 },
  { sales: 390000, consulting: 38000, brokerage: 42000, purchase: 210000, salary: 44000, rent: 28000, transport: 21000 },
  { sales: 360000, consulting: 45000, brokerage: 30000, purchase: 190000, salary: 45000, rent: 28000, transport: 19000 },
  { sales: 410000, consulting: 52000, brokerage: 25000, purchase: 225000, salary: 46000, rent: 28000, transport: 20000 },
  { sales: 445000, consulting: 40000, brokerage: 55000, purchase: 240000, salary: 48000, rent: 28000, transport: 24000 },
  { sales: 470000, consulting: 60000, brokerage: 35000, purchase: 255000, salary: 49000, rent: 28000, transport: 22000 }
];

// Note text for the balancing row that completes the current month's collections.
const CURRENT_MONTH_OTHER_NOTE = 'Other collections - cash sales and part receipts';

// Order status → payment_status, applied after the seeded payments are posted.
const ORDER_PAYMENT_STATUS = {
  full: 'Paid',
  part: 'Partial',
  none: 'Unpaid'
};

module.exports = {
  PRODUCTS,
  SELLER,
  CUSTOMERS,
  LOTS,
  QUOTATIONS,
  ORDERS,
  INVOICES,
  VISITS,
  LEDGER,
  CURRENT_MONTH_OTHER_NOTE,
  ORDER_PAYMENT_STATUS
};
