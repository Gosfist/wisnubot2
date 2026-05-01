async function columnExists(pool, tableName, columnName) {
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

async function addColumnIfMissing(pool, table, column, definition) {
  if (!(await columnExists(pool, table, column))) {
    await pool.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${definition}`);
  }
}

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "customer_service",
    "relay_waiting_text",
    "TEXT NULL AFTER relay_prompt",
  );
  await addColumnIfMissing(
    pool,
    "customer_service",
    "relay_owner_instruction",
    "TEXT NULL AFTER relay_waiting_text",
  );
  await addColumnIfMissing(
    pool,
    "customer_service",
    "relay_done_text",
    "TEXT NULL AFTER relay_owner_instruction",
  );
}
