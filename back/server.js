const express = require('express');
const cors = require('cors');
const routes = require('./routes.js');
require('./config/bd.js');

const app = express();
const PORT = 5000;

app.use(cors());
app.use('/api/taux', routes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});