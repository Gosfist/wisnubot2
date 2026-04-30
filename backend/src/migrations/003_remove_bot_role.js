export async function up(pool) {
  const [rows] = await pool.execute(`
    SELECT COUNT(*) AS cnt
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'bots'
      AND COLUMN_NAME = 'bot_role'
  `);

  if (Number(rows[0].cnt) > 0) {
    await pool.execute(`ALTER TABLE bots DROP COLUMN bot_role`);
  }
}
