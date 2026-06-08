const express   = require('express');
const cors      = require('cors');
const dotenv    = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/leads',       require('./routes/leads'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/allocation',  require('./routes/allocation'));
app.use('/api/director',    require('./routes/director'));
app.use('/api/telecaller',  require('./routes/telecaller'));
app.use('/api/ocr',         require('./routes/ocr'));         // PHASE 6

app.get('/api/health', (_req, res) =>
  res.json({ status: 'OK', message: 'Lead Management API — Phase 6' })
);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
