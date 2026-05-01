import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret',
  resetSecret: process.env.RESET_SECRET || 'wisnubot2_reset_secret',
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
