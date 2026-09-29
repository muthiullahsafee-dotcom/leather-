// Simulated GST portal integration.
//
// This is the ONLY place that knows how an IRN or an e-way bill number is produced.
// The demo never talks to the GST portal: it mints locally-shaped identifiers so the
// sales demo can show the workflow end to end.
//
// To go live, replace the bodies of `generateIRN` and `generateEWayBill` with calls
// to a GSP (ClearTax / IRIS / Cygnet …) and return the values it responds with. The
// shape returned here — { irn, generated_at } / { eway_bill, generated_at } — is the
// contract the invoice route already stores, so nothing else has to change.
const crypto = require('crypto');

// Shown next to every generated identifier in the UI and returned by the API so no
// screen can present a demo number as if it were a real filing.
const DEMO_NOTICE = 'DEMO SIMULATION. Not submitted to the GST portal.';

// A real IRN is a 64-character SHA-256 hash issued by the portal over the signed
// invoice JSON. We hash the invoice identity locally, so the demo value has the same
// shape (and is stable for the same invoice) without being a filing.
function generateIRN({ invoice_no, seller_gstin, buyer_gstin, invoice_date, total }) {
  const payload = [
    'irn-demo',
    invoice_no,
    seller_gstin,
    buyer_gstin,
    invoice_date,
    String(total)
  ].join('|');
  return { irn: crypto.createHash('sha256').update(payload).digest('hex'), generated_at: new Date().toISOString() };
}

// E-way bill numbers are 12 digits: '2' + the GSTin's 2-digit state code + a 9-digit
// serial. A real serial is allotted by the portal, so this one is random by design.
function generateEWayBill({ seller_gstin, total, mode }) {
  const state = String(seller_gstin || '').slice(0, 2).padStart(2, '0');
  const serial = String(crypto.randomInt(0, 1000000000)).padStart(9, '0');
  return {
    eway_bill: `2${state}${serial}`,
    generated_at: new Date().toISOString(),
    mode: mode || 'Road',
    value_limit_note: Number(total) > 50000 ? 'Above ₹50,000: vehicle details are required on the e-way bill.' : null
  };
}

module.exports = { DEMO_NOTICE, generateIRN, generateEWayBill };
