// Central chart palette for Recharts (SVG attributes need literal colors, not CSS vars).
// Mirrors the CSS tokens in theme.css so charts match the rest of the app.
export const PALETTE = {
  accent: '#B5651D',
  positive: '#3F5A44',
  alert: '#A64B3B',
  ink: '#2B1D14',
  muted: '#A2907C',
  pie: ['#B5651D', '#3F5A44', '#A64B3B', '#8A6A4A', '#C9A227', '#6B7A66']
};

export const inr = (v) => '₹ ' + Number(v).toLocaleString('en-IN');
