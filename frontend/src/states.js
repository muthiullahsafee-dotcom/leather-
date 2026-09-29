// GST state codes, matching the set the backend accepts in gst.js.
//
// The buyer's state code decides whether an invoice is intra-state (CGST + SGST) or
// inter-state (IGST), so the Customers form only offers codes the server will accept.
export const GST_STATES = [
  { code: '03', name: 'Punjab' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '19', name: 'West Bengal' },
  { code: '21', name: 'Odisha' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' }
];

export const SELLER_STATE_CODE = '33';
