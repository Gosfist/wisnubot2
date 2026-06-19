import pg from 'pg';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../migrations');

let pool;

function convertPlaceholders(sql) {
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  return String(sql)
    .replace(/`/g, '"')
    .replace(/\?/g, (match, offset, fullSql) => {
      const previous = fullSql[offset - 1];
      if (previous === '\\') return match;

      const before = fullSql.slice(0, offset);
      inSingleQuote = (before.match(/(?<!\\)'/g) || []).length % 2 === 1;
      inDoubleQuote = (before.match(/(?<!\\)"/g) || []).length % 2 === 1;

      if (inSingleQuote || inDoubleQuote) {
        return match;
      }

      index += 1;
      return `$${index}`;
    });
}

function aliasRows(rows, sql) {
  const aliases = [...String(sql).matchAll(/\sAS\s+([A-Za-z_][A-Za-z0-9_]*)/gi)]
    .map((match) => match[1])
    .filter((alias) => alias !== alias.toLowerCase());

  if (aliases.length === 0) {
    return rows;
  }

  return rows.map((row) => {
    for (const alias of aliases) {
      const lowered = alias.toLowerCase();
      if (row[alias] === undefined && row[lowered] !== undefined) {
        row[alias] = row[lowered];
      }
    }
    return row;
  });
}

function normalizeParams(params) {
  return params.map((param) => {
    if (typeof param === 'boolean') {
      return param ? 1 : 0;
    }
    return param;
  });
}

function normalizeResult(result, sql) {
  const rows = aliasRows(result.rows ?? [], sql);
  const meta = {
    affectedRows: result.rowCount ?? 0,
    insertId: rows[0]?.id ?? rows[0]?.insert_id ?? undefined,
    rowCount: result.rowCount ?? 0,
    command: result.command,
  };

  if (result.command === 'SELECT') {
    return [rows, meta];
  }

  return [meta];
}

const insertIdTables = new Set([
  'users',
  'bots',
  'groups',
  'broadcasts',
  'broadcast_runs',
  'broadcast_run_items',
  'activity_logs',
  'customer_service',
  'customer_service_contacts',
  'cs_buttons',
  'cs_stocks',
  'cs_transactions',
  'cs_relay_sessions',
  'push_contact_templates',
  'group_push_exclusions',
  'push_contact_runs',
  'google_accounts',
  'google_account_categories',
  'gemini_price_plans',
]);

function getInsertTableName(sql) {
  const match = String(sql).trim().match(/^insert\s+into\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))/i);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').toLowerCase();
}

function shouldAppendReturningId(sql) {
  const normalized = String(sql).trim().toLowerCase();
  return (
    normalized.startsWith('insert into ') &&
    !normalized.includes(' returning ') &&
    !normalized.includes(' on conflict ') &&
    insertIdTables.has(getInsertTableName(sql))
  );
}

function createCompatPool(pgPool) {
  function createExecutor(client) {
    return async (sql, params = []) => {
      const finalSql = shouldAppendReturningId(sql)
        ? `${sql} RETURNING id`
        : sql;
      const result = await client.query(
        convertPlaceholders(finalSql),
        normalizeParams(params),
      );
      return normalizeResult(result, finalSql);
    };
  }

  return {
    execute: createExecutor(pgPool),
    async query(sql, params = []) {
      return pgPool.query(convertPlaceholders(sql), normalizeParams(params));
    },
    async getConnection() {
      const client = await pgPool.connect();
      return {
        execute: createExecutor(client),
        async beginTransaction() {
          await client.query('BEGIN');
        },
        async commit() {
          await client.query('COMMIT');
        },
        async rollback() {
          await client.query('ROLLBACK');
        },
        release() {
          client.release();
        },
      };
    },
    async end() {
      await pgPool.end();
    },
  };
}

async function createPool() {
  const pgPool = new Pool({
    connectionString: config.db.url,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
  });

  await pgPool.query('SELECT 1');
  pool = createCompatPool(pgPool);
  return pool;
}

async function ensureMigrationsTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
    await pool.execute(
      'INSERT INTO schema_migrations (name) VALUES (?) ON CONFLICT (name) DO NOTHING',
      [filename],
    );
  }
}

export async function initDatabase() {
  await createPool();
  await runMigrations();

  logger.info('Database initialized successfully');
  return pool;
}

export async function resetDatabase() {
  await closeDatabase();
  await createPool();
  await pool.execute('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.execute('CREATE SCHEMA public');
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
