// Shared display helpers.
//
// Money, dates and numbers are formatted the same way on every screen, so a rupee
// figure means the same thing in the dashboard tile, the invoice and the ledger.
// Indian numbering (1,23,456.78) and the ₹ sign are used throughout.

const RUPEE = '₹';

const amount = (v) => Number(v || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const amount0 = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

// Money for tiles and totals, where the paise are noise.
export const inr = (v) => RUPEE + ' ' + amount0(v);

// Money where the paise are part of the document (invoices, order lines, ledger).
export const inr2 = (v) => RUPEE + ' ' + amount(v);

// Compact money for chart axes, which have no room for six digits. Indian units, so a
// month of sales reads "₹4.9L" rather than an unreadable "₹490,000".
export const inrShort = (v) => {
  const n = Number(v || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}${RUPEE}${(abs / 1e7).toFixed(abs >= 1e8 ? 0 : 1)}Cr`;
  if (abs >= 1e5) return `${sign}${RUPEE}${(abs / 1e5).toFixed(abs >= 1e6 ? 0 : 1)}L`;
  if (abs >= 1e3) return `${sign}${RUPEE}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${RUPEE}${Math.round(abs)}`;
};

export const num = (v) => Number(v || 0).toLocaleString('en-IN');

// Quantities drop a trailing '.00' but keep a real fraction.
export const qty = (v) => {
  const n = Number(v || 0);
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
};

// The seller's own calendar day. toISOString() would roll back to yesterday for
// anyone east of UTC before mid-morning, which is most of this business's day.
export const today = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const addDays = (date, days) => {
  const [y, m, d] = String(date).split('-').map(Number);
  const next = new Date(y, m - 1, d);
  next.setDate(next.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2026-09' -> 'Sep 2026'
export const monthLabel = (month) => {
  if (!month) return '';
  const [y, m] = String(month).split('-');
  return `${MONTHS[Number(m) - 1] || ''} ${y}`;
};

// '2026-09-14' -> '14 Sep 2026'
export const dateLabel = (date) => {
  if (!date) return '';
  const [y, m, d] = String(date).split('-');
  return `${d} ${MONTHS[Number(m) - 1] || ''} ${y}`;
};

// Whole days between two dates; negative when `to` is in the past.
export const daysFromToday = (date) => {
  if (!date) return 0;
  const [y, m, d] = String(date).split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const [ty, tm, td] = today().split('-').map(Number);
  const now = new Date(ty, tm - 1, td);
  return Math.round((target - now) / 86400000);
};

// A short human label for an invoice due date: "Due in 6 days" / "12 days overdue".
export const dueLabel = (dueDate) => {
  const days = -daysFromToday(dueDate);
  if (days < 0) return Math.abs(days) + ' day' + (Math.abs(days) === 1 ? '' : 's') + ' overdue';
  if (days === 0) return 'Due today';
  return 'Due in ' + days + ' day' + (days === 1 ? '' : 's');
};

export const DASH = '—';
