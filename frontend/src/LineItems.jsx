// A reusable line-item editor, shared by Quotations and Orders.
//
// Both documents are the same shape — a customer, a date, and a list of chemical
// lines with a quantity, selling price and cost — so the editor lives here rather than
// being copy-pasted into two screens that would then drift apart.

import { inr2, num } from './format.js';

const blankItem = () => ({ product_id: '', quantity: '', unit_price: '', unit_cost: '' });

export function blankItems() {
  return [blankItem()];
}

export function itemTotal(item) {
  return Number(item.quantity || 0) * Number(item.unit_price || 0);
}

// The order form is read into this shape on load, so the editor only ever deals in
// strings (what an <input> holds) and converts on submit.
export function toItems(rows) {
  return rows.map((it) => ({
    product_id: String(it.product_id),
    quantity: String(it.quantity),
    unit_price: String(it.unit_price),
    unit_cost: String(it.unit_cost)
  }));
}

export function itemPayload(items) {
  return items.map((it) => ({
    product_id: Number(it.product_id),
    quantity: Number(it.quantity),
    unit_price: Number(it.unit_price),
    unit_cost: Number(it.unit_cost)
  }));
}

export default function LineItems({ items, setItems, products }) {
  const setItem = (idx, key) => (e) => {
    const next = items.slice();
    next[idx] = { ...next[idx], [key]: e.target.value };
    // Picking a chemical prefills the selling price and cost from the master, so the
    // seller types a quantity instead of looking up two numbers. Anything already
    // typed is left alone.
    if (key === 'product_id') {
      const p = products.find((x) => x.id === Number(e.target.value));
      if (p) {
        if (next[idx].unit_price === '') next[idx].unit_price = String(p.selling_price ?? '');
        if (next[idx].unit_cost === '') next[idx].unit_cost = String(p.purchase_price ?? '');
      }
    }
    setItems(next);
  };

  const add = () => setItems([...items, blankItem()]);
  const remove = (idx) => setItems(items.filter((_, i) => i !== idx));

  const total = items.reduce((s, it) => s + itemTotal(it), 0);

  return (
    <>
      <h4 className="sub-head">Items</h4>
      {items.map((it, idx) => (
        <div className="item-row" key={idx}>
          <select value={it.product_id} onChange={setItem(idx, 'product_id')} required>
            <option value="">Chemical…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="any"
            min="0"
            placeholder="Qty"
            value={it.quantity}
            onChange={setItem(idx, 'quantity')}
            required
          />
          <input
            type="number"
            step="any"
            min="0"
            placeholder="Rate (₹)"
            value={it.unit_price}
            onChange={setItem(idx, 'unit_price')}
            required
          />
          <input
            type="number"
            step="any"
            min="0"
            placeholder="Cost (₹)"
            value={it.unit_cost}
            onChange={setItem(idx, 'unit_cost')}
            required
          />
          <span className="item-total">{inr2(itemTotal(it))}</span>
          {items.length > 1 && (
            <button type="button" className="link danger" onClick={() => remove(idx)} aria-label="Remove line">
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={add}>
          + Add item
        </button>
        <span className="items-grand">
          {num(items.length)} {items.length === 1 ? 'line' : 'lines'} · {inr2(total)}
        </span>
      </div>
    </>
  );
}
