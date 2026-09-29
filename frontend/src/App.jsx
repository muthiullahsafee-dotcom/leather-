import { useState } from 'react';
import Dashboard from './modules/Dashboard.jsx';
import Products from './modules/Products.jsx';
import Stock from './modules/Stock.jsx';
import Customers from './modules/Customers.jsx';
import Quotations from './modules/Quotations.jsx';
import Orders from './modules/Orders.jsx';
import Invoices from './modules/Invoices.jsx';
import PendingPayments from './modules/PendingPayments.jsx';
import Lots from './modules/Lots.jsx';
import Visits from './modules/Visits.jsx';
import Ledger from './modules/Ledger.jsx';
import Reports from './modules/Reports.jsx';

// The order here is the seller's own workflow: quote, then order, then invoice, then
// collect the money. Stock, lots and visits sit alongside because they are what the
// technical team manages between sales.
const MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: '◫', view: Dashboard },
  { id: 'products', label: 'Products', icon: '▦', view: Products },
  { id: 'stock', label: 'Stock', icon: '▣', view: Stock },
  { id: 'customers', label: 'Customers', icon: '◉', view: Customers },
  { id: 'quotations', label: 'Quotations', icon: '✎', view: Quotations },
  { id: 'orders', label: 'Orders', icon: '☰', view: Orders },
  { id: 'invoices', label: 'Invoices', icon: '⧉', view: Invoices },
  { id: 'pending', label: 'Pending Payments', icon: '⏱', view: PendingPayments, wide: true },
  { id: 'lots', label: 'Lots', icon: '▤', view: Lots },
  { id: 'visits', label: 'Technical Visits', icon: '⚑', view: Visits, wide: true },
  { id: 'ledger', label: 'Ledger', icon: '₹', view: Ledger },
  { id: 'reports', label: 'Reports', icon: '◮', view: Reports }
];

export default function App() {
  const [active, setActive] = useState('dashboard');
  const current = MODULES.find((m) => m.id === active) || MODULES[0];
  const View = current.view;

  // Tiles and links elsewhere in the app can jump straight to a module.
  const navigate = (id) => setActive(id);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">◫</span>
          <span className="brand-name">Surya Tech</span>
          <span className="brand-sub">Vaniyambadi · Leather Chemicals</span>
        </div>
        <nav className="side-nav">
          {MODULES.map((m) => (
            <button
              key={m.id}
              className={m.id === active ? 'nav-item active' : 'nav-item'}
              onClick={() => setActive(m.id)}
            >
              <span className="nav-icon">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content" key={current.id}>
        <View onNavigate={navigate} />
      </main>

      <nav className="bottom-nav">
        {MODULES.map((m) => (
          <button
            key={m.id}
            className={(m.id === active ? 'bottom-item active' : 'bottom-item') + (m.wide ? ' wide' : '')}
            onClick={() => setActive(m.id)}
          >
            <span className="bottom-icon">{m.icon}</span>
            <span className="bottom-label">{m.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
