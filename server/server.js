require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const { startCronJobs } = require('./cron');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

initDb().then(() => {
  startCronJobs();

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/resources', require('./routes/resources'));
  app.use('/api/bookings', require('./routes/bookings'));
  app.use('/api/admin', require('./routes/admin'));

  app.use(express.static(path.join(__dirname, '../client')));
  app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/login.html'));
  });

  app.get('/resources', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/resources.html'));
  });

  app.get('/resources/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/resource-detail.html'));
  });

  app.get('/my-bookings', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/my-bookings.html'));
  });

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/admin.html'));
  });

  app.get('*', (req, res) => {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(404).json({ error: 'Endpoint not found.' });
    }
    res.redirect('/resources');
  });
  app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`CampusDesk Server running on: http://localhost:${PORT}`);
    console.log(`Press Ctrl+C to terminate...`);
    console.log(`==================================================`);
  });
}).catch(err => {
  console.error('Failed to start server due to DB initialization failure:', err);
  process.exit(1);
});
