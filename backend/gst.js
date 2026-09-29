// GST math and number-to-words, in one place.
//
// Every tax computation in the app (quotation previews, invoice creation, invoice
// detail) goes through `computeInvoiceTotals` so the CGST/SGST vs IGST split and the
// 2-decimal rounding can never drift between screens.
//
// ASSUMPTION: no round-off line. Totals are exact to 2 decimals and the invoice total
// is always the exact sum of its line totals (taxable value + tax), which is what the
// GST portal expects a machine-readable invoice to show.

const STATE_CODES = {
  '03': 'Punjab',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '19': 'West Bengal',
  '21': 'Odisha',
  '23': 'Madhya Pradesh',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '36': 'Telangana',
  '37': 'Andhra Pradesh'
};

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function stateName(code) {
  return STATE_CODES[String(code)] || null;
}

// A supply inside the seller's own state is intra-state: the tax is split evenly into
// CGST + SGST. Any other state is inter-state: the whole tax is charged as IGST.
function isIntraState(sellerStateCode, buyerStateCode) {
  return String(sellerStateCode) === String(buyerStateCode);
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen'
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowThousand(n) {
  const parts = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(ONES[hundreds] + ' Hundred');
  if (rest >= 1 && rest <= 19) {
    parts.push(ONES[rest]);
  } else if (rest >= 20) {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    parts.push(TENS[tens] + (ones ? ' ' + ONES[ones] : ''));
  }
  return parts.join(' ');
}

// Indian numbering (crore / lakh / thousand) — the wording an Indian invoice prints.
// The "Rupees" / "Paise" words are part of the document, so a tax invoice that shows
// the total in words reads the way a printed bill does.
function amountInWords(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  let rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  const parts = [];
  const crore = Math.floor(rupees / 10000000);
  rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000);
  rupees %= 100000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;

  if (crore) parts.push(belowThousand(crore) + ' Crore');
  if (lakh) parts.push(belowThousand(lakh) + ' Lakh');
  if (thousand) parts.push(belowThousand(thousand) + ' Thousand');
  if (rupees) parts.push(belowThousand(rupees));

  let text = parts.join(' ');
  if (text) text += ' Rupees';
  if (paise) text += (text ? ' and ' : '') + belowThousand(paise) + ' Paise';
  return text + ' Only';
}

// lines: [{ product_id, hsn_code, description, unit, quantity, rate, gst_rate }]
// Returns per-line taxable value / tax plus the invoice header totals.
function computeInvoiceTotals(lines, sellerStateCode, buyerStateCode) {
  const intra = isIntraState(sellerStateCode, buyerStateCode);
  const items = [];
  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  for (const line of lines) {
    const quantity = Number(line.quantity) || 0;
    const rate = Number(line.rate) || 0;
    const gstRate = Number(line.gst_rate) || 0;
    const taxable = round2(quantity * rate);
    const tax = round2((taxable * gstRate) / 100);
    // SGST takes the remainder so CGST + SGST always re-adds to the exact tax.
    const lineCgst = intra ? round2(tax / 2) : 0;
    const lineSgst = intra ? round2(tax - lineCgst) : 0;
    const lineIgst = intra ? 0 : tax;

    subtotal += taxable;
    cgst += lineCgst;
    sgst += lineSgst;
    igst += lineIgst;

    items.push({
      ...line,
      quantity,
      rate,
      gst_rate: gstRate,
      taxable_value: taxable,
      cgst: lineCgst,
      sgst: lineSgst,
      igst: lineIgst,
      tax_amount: tax,
      line_total: round2(taxable + tax)
    });
  }

  subtotal = round2(subtotal);
  cgst = round2(cgst);
  sgst = round2(sgst);
  igst = round2(igst);
  const total = round2(subtotal + cgst + sgst + igst);

  return {
    items,
    tax_type: intra ? 'CGST+SGST' : 'IGST',
    place_of_supply: stateName(buyerStateCode),
    subtotal,
    cgst,
    sgst,
    igst,
    total,
    amount_in_words: amountInWords(total)
  };
}

// Status follows the amount received: fully settled, partly settled or fully open.
function paymentStatus(amountPaid, total) {
  const paid = round2(amountPaid);
  const due = round2(Number(total) - paid);
  if (due <= 0) return 'Paid';
  if (paid > 0) return 'Partially Paid';
  return 'Unpaid';
}

module.exports = {
  STATE_CODES,
  round2,
  stateName,
  isIntraState,
  amountInWords,
  computeInvoiceTotals,
  paymentStatus
};
