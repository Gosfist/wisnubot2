export async function tableExists(pool, tableName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName],
  );
  return Number(rows[0].cnt) > 0;
}

export async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  return Number(rows[0].cnt) > 0;
}

export async function foreignKeyName(pool, tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows[0]?.CONSTRAINT_NAME ?? null;
}

export async function indexExists(pool, tableName, indexName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [tableName, indexName],
  );
  return Number(rows[0].cnt) > 0;
}

export async function uniqueIndexNameForColumn(pool, tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND NON_UNIQUE = 0
        AND INDEX_NAME <> 'PRIMARY'
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows[0]?.INDEX_NAME ?? null;
}

export async function addColumnIfMissing(pool, tableName, columnName, definition) {
  if (!(await tableExists(pool, tableName))) {
    return false;
  }

  if (await columnExists(pool, tableName, columnName)) {
    return false;
  }

  await pool.execute(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
  );
  return true;
}
