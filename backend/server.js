const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const dotenv       = require('dotenv');
const connectDB    = require('./config/db');

dotenv.config();

// ── Startup env validation ─────────────────────────────────────
// Fail fast rather than silently broken features at runtime.
const REQUIRED_ENV = ['JWT_SECRET', 'MONGO_URI'];
const missingEnv   = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`FATAL: Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

connectDB();

const app = express();

// ── Security headers ───────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS — restrict to configured frontend origin ──────────────
// Set FRONTEND_URL in .env (e.g. https://your-crm.example.com).
// In development, defaults to localhost:5173. Multiple origins can
// be space-separated: "https://app.example.com http://localhost:5173"
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(' ')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));

// ── Rate limiting — auth routes ────────────────────────────────
// 10 attempts per 15 minutes per IP on login/register.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many login attempts. Please try again later.' },
});

// ── Query param sanitization ───────────────────────────────────
// Prevents NoSQL operator injection via query strings such as
// ?status[$ne]=New → { status: { $ne: 'New' } }
// Express's qs parser converts bracket-notation into objects;
// this middleware rejects any request whose query params contain
// non-primitive (object/array) values before they reach controllers.
const sanitizeQueryParams = (req, res, next) => {
  const suspicious = Object.entries(req.query).find(
    ([, v]) => v !== null && typeof v === 'object'
  );
  if (suspicious) {
    return res.status(400).json({ message: 'Invalid query parameter format.' });
  }
  next();
};

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply sanitization to all API routes
app.use('/api', sanitizeQueryParams);

app.use('/api/auth',       authLimiter);   // rate-limit auth first
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/leads',      require('./routes/leads'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/allocation', require('./routes/allocation'));
app.use('/api/director',   require('./routes/director'));
app.use('/api/telecaller', require('./routes/telecaller'));
app.use('/api/ocr',        require('./routes/ocr'));
app.use('/api/sheets',     require('./routes/sheets'));
app.use('/api/push',       require('./routes/push'));
app.use('/api/audit',      require('./routes/audit'));

app.get('/api/health', (_req, res) =>
  res.json({ status: 'OK', message: 'Lead Management API — Phase G.2' })
);

// ── Global error handler — no stack traces in production ───────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // I2-003: multer file-size exceeded → 413 with clear message
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'CSV file exceeds the 5MB limit.' });
  }
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(isDev && err.stack ? { stack: err.stack } : {}),
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  const { startReminderScheduler } = require('./utils/reminderScheduler');
  startReminderScheduler();
});
