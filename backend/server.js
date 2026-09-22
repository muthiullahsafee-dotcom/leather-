const express = require('express');
const cors = require('cors');
const db = require('./db');
const { init } = require('./init');

init()
  .then(() => {
    const app = express();
    const PORT = process.env.PORT || 3001;

    app.use(cors());
    app.use(express.json());

    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    app.use('/api/products', require('./routes/products'));
    app.use('/api/stock', require('./routes/stock'));
    app.use('/api/customers', require('./routes/customers'));
    app.use('/api/orders', require('./routes/orders'));
    app.use('/api/batches', require('./routes/batches'));
    app.use('/api/quality-checks', require('./routes/quality'));
    app.use('/api/income-expenses', require('./routes/ledger'));
    app.use('/api/reports', require('./routes/reports'));

    app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    app.use((err, req, res, next) => {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    });

    const server = app.listen(PORT, () => {
      console.log(`Leather Stylish API running on http://localhost:${PORT}`);
    });

    module.exports = { app, server, db };
  })
  .catch((e) => {
    console.error('FAILED TO START (check DATABASE_URL):', e.message);
    process.exit(1);
  });