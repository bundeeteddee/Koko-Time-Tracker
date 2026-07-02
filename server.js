const path = require('node:path');
const express = require('express');
const routes = require('./src/routes');
const reminders = require('./src/reminders');

const app = express();
app.use(express.json());
app.use('/api', routes);
app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'internal error' });
});

const PORT = Number(process.env.PORT || 4321);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`TimeKeeping running at http://localhost:${PORT}`);
  reminders.start();
  require('./src/sheets-sync').start();
});
