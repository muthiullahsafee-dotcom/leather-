// Calendar-date helpers shared by the routes and the seed.
//
// Every date in this app is a plain 'YYYY-MM-DD' string and always means the seller's
// local calendar day, so the helpers below deliberately avoid toISOString(): that
// converts to UTC first, and a seller in India (UTC+5:30) running the app at 00:30
// would get yesterday's date. The demo runs on the seller's own machine, so the local
// calendar is the correct one to report.
const pad = (n) => String(n).padStart(2, '0');

const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function today() {
  return format(new Date());
}

function thisMonth() {
  return today().slice(0, 7);
}

// Parses 'YYYY-MM-DD' into a local date at midnight.
function parse(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const d = parse(date);
  d.setDate(d.getDate() + days);
  return format(d);
}

function addMonths(month, months) {
  const [y, m] = String(month).split('-').map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// Whole days between two 'YYYY-MM-DD' dates, positive when `to` is the later day.
function daysBetween(from, to) {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000);
}

module.exports = { today, thisMonth, parse, addDays, addMonths, daysBetween };
