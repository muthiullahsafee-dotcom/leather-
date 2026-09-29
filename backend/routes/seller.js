const express = require('express');
const db = require('../db');
const { stateName } = require('../gst');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// The selling entity: Surya Tech, Vaniyambadi. Its GST state code is what decides
// whether an invoice carries CGST + SGST (Tamil Nadu) or IGST (any other state).
// The demo stores one row and flags it as sample data.
const SELECT = `
  SELECT *, CASE WHEN is_sample = 1 THEN true ELSE false END AS is_sample_flag FROM seller_profile
`;

router.get('/', wrap(async (req, res) => {
  const row = await db.get(SELECT + ' ORDER BY id LIMIT 1');
  if (!row) return res.status(404).json({ error: 'Seller profile not found - run npm run seed' });
  res.json({ ...row, state_name: stateName(row.state_code) });
}));

router.get('/:id', wrap(async (req, res) => {
  const row = await db.get(SELECT + ' WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Seller profile not found' });
  res.json({ ...row, state_name: stateName(row.state_code) });
}));

router.put('/:id', wrap(async (req, res) => {
  const existing = await db.get('SELECT * FROM seller_profile WHERE id = $1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Seller profile not found' });
  const b = req.body || {};
  const next = {
    business_name: b.business_name !== undefined ? b.business_name : existing.business_name,
    address: b.address !== undefined ? b.address : existing.address,
    city: b.city !== undefined ? b.city : existing.city,
    district: b.district !== undefined ? b.district : existing.district,
    state: b.state !== undefined ? b.state : existing.state,
    state_code: b.state_code !== undefined ? b.state_code : existing.state_code,
    gstin: b.gstin !== undefined ? b.gstin : existing.gstin,
    phone: b.phone !== undefined ? b.phone : existing.phone,
    email: b.email !== undefined ? b.email : existing.email
  };
  if (!next.business_name || !next.state_code) return res.status(400).json({ error: 'business_name and state_code are required' });
  if (!stateName(next.state_code)) return res.status(400).json({ error: 'state_code must be a valid GST state code' });
  await db.run(`UPDATE seller_profile SET business_name = $1, address = $2, city = $3, district = $4,
    state = $5, state_code = $6, gstin = $7, phone = $8, email = $9 WHERE id = $10`,
    [next.business_name, next.address, next.city, next.district, next.state, next.state_code,
      next.gstin, next.phone, next.email, existing.id]);
  res.json(await db.get(SELECT + ' WHERE id = $1', [existing.id]));
}));

module.exports = router;
