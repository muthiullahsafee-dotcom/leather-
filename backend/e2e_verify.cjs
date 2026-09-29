// Tax-math checks for the Surya Tech demo.
//
// These exercise `gst.js` directly, with no database, because this is the one piece of
// money logic the whole app shares: every screen that shows a tax figure must get the
// same answer. The rules checked here are the ones a real invoice has to satisfy —
// an intra-state sale splits the tax into CGST + SGST, an inter-state sale charges IGST,
// every amount is rounded to exactly 2 decimals, and the total is always the exact sum
// of the lines (no round-off line).
//
// Run with:  node e2e_verify.cjs

const {
  round2, stateName, isIntraState, amountInWords,
  computeInvoiceTotals, paymentStatus
} = require('./gst');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name);
    console.log('FAIL  ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  }
}

const SELLER = '33'; // Tamil Nadu
const line = (quantity, rate, gst_rate, over) => ({
  product_id: 1, hsn_code: '3808', description: 'Retanning Auxiliary',
  unit: 'kg', quantity, rate, gst_rate, ...over
});

function main() {
  // ── Rounding ───────────────────────────────────────────────────────────────────
  check('round2 rounds to 2 decimals', round2(10.005) === 10.01 || round2(10.005) === 10.01, round2(10.005));
  check('round2 keeps 2 decimals exact', round2(1414.82) === 1414.82, round2(1414.82));
  check('round2 handles repeating halves', round2(1.005) === 1.01, round2(1.005));
  check('round2 accepts numeric strings', round2('20579.20') === 20579.2, round2('20579.20'));

  // ── State helpers ──────────────────────────────────────────────────────────────
  check('Tamil Nadu is GST state 33', stateName('33') === 'Tamil Nadu', stateName('33'));
  check('West Bengal is GST state 19', stateName('19') === 'West Bengal', stateName('19'));
  check('an unknown state code resolves to null', stateName('99') === null, stateName('99'));
  check('a sale inside the seller state is intra-state', isIntraState('33', '33') === true);
  check('a sale to another state is inter-state', isIntraState('33', '19') === false);

  // ── Intra-state: CGST + SGST ───────────────────────────────────────────────────
  const intra = computeInvoiceTotals(
    [line(2, 1500, 18), line(4, 250.5, 12), line(1, 999.99, 5)],
    SELLER, '33'
  );
  check('intra-state invoices are labelled CGST+SGST', intra.tax_type === 'CGST+SGST', intra.tax_type);
  check('place of supply is the buyer state', intra.place_of_supply === 'Tamil Nadu', intra.place_of_supply);
  check('intra-state invoices carry no IGST', intra.igst === 0, intra.igst);
  check('CGST and SGST are equal to the paisa', intra.cgst === intra.sgst, { cgst: intra.cgst, sgst: intra.sgst });
  check('CGST + SGST equals the full tax', Math.abs(intra.cgst + intra.sgst - (intra.total - intra.subtotal)) < 0.005,
    { cgst: intra.cgst, sgst: intra.sgst, tax: intra.total - intra.subtotal });

  // ── Inter-state: IGST ──────────────────────────────────────────────────────────
  const inter = computeInvoiceTotals([line(2, 1500, 18)], SELLER, '19');
  check('inter-state invoices are labelled IGST', inter.tax_type === 'IGST', inter.tax_type);
  check('inter-state invoices carry no CGST or SGST', inter.cgst === 0 && inter.sgst === 0, { cgst: inter.cgst, sgst: inter.sgst });
  check('IGST is the full 18% of 3000', inter.igst === 540, inter.igst);
  check('the same sale taxed for an IGST buyer costs the same as CGST+SGST',
    inter.total === computeInvoiceTotals([line(2, 1500, 18)], SELLER, '33').total,
    { inter: inter.total, intra: computeInvoiceTotals([line(2, 1500, 18)], SELLER, '33').total });

  // ── The total is always the sum of the lines ───────────────────────────────────
  const samples = [
    [[line(2, 1500, 18)], '33'],
    [[line(3, 1234.56, 12), line(7, 99.99, 5)], '33'],
    [[line(1, 1, 18), line(1, 1, 12), line(1, 1, 5), line(1, 1, 18)], '33'],
    [[line(3, 1234.56, 12), line(7, 99.99, 5)], '09'],
    [[line(40, 104.4, 18), line(18, 415.5, 12)], '19']
  ];
  let lineSumOk = true;
  let centsOk = true;
  const failuresSeen = [];
  for (const [lines, buyer] of samples) {
    const t = computeInvoiceTotals(lines, SELLER, buyer);
    const sum = round2(t.items.reduce((s, i) => s + i.taxable_value + i.tax_amount, 0));
    if (Math.abs(t.total - sum) > 0.004) { lineSumOk = false; failuresSeen.push({ buyer, total: t.total, sum }); }
    for (const n of [t.subtotal, t.cgst, t.sgst, t.igst, t.total]) {
      if (round2(n) !== n) { centsOk = false; failuresSeen.push({ buyer, n }); }
    }
  }
  check('invoice total always equals the sum of its line totals', lineSumOk, failuresSeen);
  check('every amount lands on a whole paisa', centsOk, failuresSeen);
  check('an invoice has no round-off line', !('round_off' in intra) && !('roundoff' in intra), Object.keys(intra));

  // ── Line-level values ──────────────────────────────────────────────────────────
  const l0 = intra.items[0];
  check('line taxable value = quantity x rate', l0.taxable_value === 3000, l0.taxable_value);
  check('line tax = taxable value x GST rate', l0.tax_amount === 540, l0.tax_amount);
  check('line total = taxable value + tax', l0.line_total === 3540, l0.line_total);
  check('line CGST + SGST re-adds to the line tax', Math.abs(l0.cgst + l0.sgst - l0.tax_amount) < 0.005, l0);

  // ── Odd GST rate that does not split evenly in two ─────────────────────────────
  // 18% of 33.33 = 5.9994 -> 6.00 tax; half of that is 3.00, so CGST + SGST still = 6.00.
  const odd = computeInvoiceTotals([line(1, 33.33, 18)], SELLER, '33');
  check('CGST + SGST still re-adds for a tax that does not split evenly',
    Math.abs(odd.cgst + odd.sgst - odd.igst - odd.items[0].tax_amount) < 0.005,
    { cgst: odd.cgst, sgst: odd.sgst, lineTax: odd.items[0].tax_amount });

  // ── Amount in words ────────────────────────────────────────────────────────────
  check('zero reads as Zero Rupees Only', amountInWords(0) === 'Zero Rupees Only', amountInWords(0));
  check('a rupee amount reads correctly', amountInWords(3540) === 'Three Thousand Five Hundred Forty Rupees Only', amountInWords(3540));
  check('paise are spelled out', amountInWords(3540.5) === 'Three Thousand Five Hundred Forty Rupees and Fifty Paise Only', amountInWords(3540.5));
  check('lakh and crore use Indian units', amountInWords(12345678) === 'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees Only', amountInWords(12345678));
  check('a non-number returns an empty string', amountInWords('abc') === '', amountInWords('abc'));
  check('the invoice carries its own amount in words', typeof intra.amount_in_words === 'string' && intra.amount_in_words.endsWith('Only'), intra.amount_in_words);

  // ── Payment status ─────────────────────────────────────────────────────────────
  check('nothing paid -> Unpaid', paymentStatus(0, 1000) === 'Unpaid');
  check('part paid -> Partially Paid', paymentStatus(400, 1000) === 'Partially Paid');
  check('fully paid -> Paid', paymentStatus(1000, 1000) === 'Paid');
  check('overpaid -> Paid', paymentStatus(1200, 1000) === 'Paid');
  check('a 0.01 shortfall is still Partially Paid', paymentStatus(999.99, 1000) === 'Partially Paid', paymentStatus(999.99, 1000));

  // ── Guards ─────────────────────────────────────────────────────────────────────
  const empty = computeInvoiceTotals([], SELLER, '33');
  check('an invoice with no lines totals zero', empty.total === 0 && empty.items.length === 0, empty);
  const missingState = computeInvoiceTotals([line(1, 100, 18)], SELLER, '99');
  check('an unknown buyer state yields no place of supply', missingState.place_of_supply === null, missingState.place_of_supply);
  check('an unknown buyer state is still taxed as IGST', missingState.igst === 18, missingState.igst);

  console.log('\n=== GST CHECK: ' + passed + ' passed, ' + failed + ' failed ===');
  if (failed) console.log('Failed checks:\n  - ' + failures.join('\n  - '));
  process.exit(failed ? 1 : 0);
}

main();
