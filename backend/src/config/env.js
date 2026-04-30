import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret',
  resetSecret: process.env.RESET_SECRET || 'wisnubot2_reset_secret',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wisnubot2',
  },
  sessionDir: process.env.SESSION_DIR || './sessions',
};
