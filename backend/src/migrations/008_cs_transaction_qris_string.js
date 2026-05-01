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

export async function up(pool) {
  if (!(await columnExists(pool, "cs_transactions", "qris_string"))) {
    await pool.execute(
      "ALTER TABLE cs_transactions ADD COLUMN qris_string TEXT NULL AFTER pakasir_payment_url",
    );
  }
}
