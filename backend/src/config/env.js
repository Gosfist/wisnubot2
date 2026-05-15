import dotenv from 'dotenv';
dotenv.config();

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOrigins(value) {
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  return String(value || defaults.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  appOrigins: parseOrigins(process.env.APP_ORIGIN),
  jwtSecret: process.env.JWT_SECRET || '',
  resetSecret: process.env.RESET_SECRET || '',
  cookie: {
    secure: parseBoolean(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
  },
  login: {
    maxFailures: parsePositiveInt(process.env.LOGIN_MAX_FAILURES, 3),
    lockMinutes: parsePositiveInt(process.env.LOGIN_LOCK_MINUTES, 15),
  },
  db: {
    url: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL !== 'false',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'postgres',
  },
  sessionDir: process.env.SESSION_DIR || './sessions',
};

if (!config.db.url) {
  config.db.url = `postgresql://${encodeURIComponent(config.db.user)}:${encodeURIComponent(
    config.db.password,
  )}@${config.db.host}:${config.db.port}/${config.db.database}`;
}

export function assertSecurityConfig() {
  const missing = [];
  if (!config.jwtSecret) missing.push('JWT_SECRET');
  if (!config.resetSecret) missing.push('RESET_SECRET');

  if (missing.length) {
    throw new Error(`Missing required security environment variables: ${missing.join(', ')}`);
  }

  if (config.nodeEnv === 'production' && !config.cookie.secure) {
    throw new Error('COOKIE_SECURE must be true in production.');
  }
}

export function isOriginAllowed(origin) {
  if (!origin) return true;
  return config.appOrigins.includes(origin);
}
