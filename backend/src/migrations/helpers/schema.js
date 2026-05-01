export async function tableExists(pool, tableName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ?`,
    [tableName],
  );
  return Number(rows[0].cnt) > 0;
}

export async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ?
        AND column_name = ?`,
    [tableName, columnName],
  );
  return Number(rows[0].cnt) > 0;
}

export async function foreignKeyName(pool, tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT tc.constraint_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = current_schema()
        AND tc.table_name = ?
        AND kcu.column_name = ?
        AND tc.constraint_type = 'FOREIGN KEY'
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows[0]?.constraint_name ?? null;
}

export async function indexExists(pool, tableName, indexName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = ?
        AND indexname = ?`,
    [tableName, indexName],
  );
  return Number(rows[0].cnt) > 0;
}

export async function uniqueIndexNameForColumn(pool, tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT i.relname AS index_name
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname = current_schema()
        AND t.relname = ?
        AND a.attname = ?
        AND ix.indisunique = true
        AND ix.indisprimary = false
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows[0]?.index_name ?? null;
}

export async function addColumnIfMissing(pool, tableName, columnName, definition) {
  if (!(await tableExists(pool, tableName))) {
    return false;
  }

  if (await columnExists(pool, tableName, columnName)) {
    return false;
  }

  await pool.execute(
    `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${definition}`,
  );
  return true;
}
