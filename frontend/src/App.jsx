import { useState } from 'react';
import Dashboard from './modules/Dashboard.jsx';
import Products from './modules/Products.jsx';
import Stock from './modules/Stock.jsx';
import Customers from './modules/Customers.jsx';
import Orders from './modules/Orders.jsx';
import Batches from './modules/Batches.jsx';
import Quality from './modules/Quality.jsx';
import Ledger from './modules/Ledger.jsx';
import Reports from './modules/Reports.jsx';

const MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: '◫', view: Dashboard },
  { id: 'products', label: 'Products', icon: '▦', view: Products },
  { id: 'stock', label: 'Stock', icon: '▣', view: Stock },
  { id: 'customers', label: 'Customers', icon: '◉', view: Customers },
  { id: 'orders', label: 'Orders', icon: '☰', view: Orders },
  { id: 'batches', label: 'Batches', icon: '▤', view: Batches },
  { id: 'quality', label: 'Quality', icon: '✓', view: Quality },
  { id: 'ledger', label: 'Ledger', icon: '₹', view: Ledger },
  { id: 'reports', label: 'Reports', icon: '◮', view: Reports }
];

export default function App() {
  const [active, setActive] = useState('dashboard');
  const current = MODULES.find((m) => m.id === active);
  const View = current ? current.view : Dashboard;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">◫</span>
          <span className="brand-name">Leather Stylish</span>
          <span className="brand-sub">Ambur · Footwear Mfg</span>
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

      <main className="main-content">
        <View />
      </main>

      <nav className="bottom-nav">
        {MODULES.map((m) => (
          <button
            key={m.id}
            className={m.id === active ? 'bottom-item active' : 'bottom-item'}
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