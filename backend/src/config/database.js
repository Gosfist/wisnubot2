import mysql from 'mysql2/promise';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../migrations');

let pool;

function getBaseConnectionConfig() {
  return {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
  };
}

async function ensureDatabaseExists() {
  const tempConn = await mysql.createConnection(getBaseConnectionConfig());
  await tempConn.execute(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\``
  );
  await tempConn.end();
}

export async function resetDatabase() {
  await closeDatabase();

  const tempConn = await mysql.createConnection(getBaseConnectionConfig());
  await tempConn.execute(`DROP DATABASE IF EXISTS \`${config.db.database}\``);
  await tempConn.execute(`CREATE DATABASE \`${config.db.database}\``);
  await tempConn.end();
}

async function createPool() {
  pool = mysql.createPool({
    ...getBaseConnectionConfig(),
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  return pool;
}

async function ensureMigrationsTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getMigrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function loadMigration(filename) {
  const migrationPath = path.join(migrationsDir, filename);
  const module = await import(pathToFileURL(migrationPath).href);
  if (typeof module.up !== 'function') {
    throw new Error(`Migration ${filename} is missing an up() function`);
  }
  return module;
}

async function getAppliedMigrations() {
  const [rows] = await pool.execute('SELECT name FROM schema_migrations');
  return new Set(rows.map((row) => row.name));
}

export async function runMigrations() {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  await ensureMigrationsTable();

  const appliedMigrations = await getAppliedMigrations();
  const migrationFiles = await getMigrationFiles();

  for (const filename of migrationFiles) {
    if (appliedMigrations.has(filename)) {
      continue;
    }

    logger.info(`Running migration ${filename}`);
    const migration = await loadMigration(filename);
    await migration.up(pool);
    await pool.execute('INSERT INTO schema_migrations (name) VALUES (?)', [
      filename,
    ]);
  }
}

export async function initDatabase() {
  await ensureDatabaseExists();
  await createPool();
  await runMigrations();

  logger.info('Database initialized successfully');
  return pool;
}

export async function clearAllUserSessions() {
  if (!pool) {
    throw new Error('Database not initialized');
  }

  await pool.execute('DELETE FROM user_sessions');
  logger.info('All persisted user sessions cleared');
}

export function getPool() {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
