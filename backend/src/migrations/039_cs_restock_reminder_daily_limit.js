export async function up(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cs_restock_reminders (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      customer_jid VARCHAR(100) NOT NULL,
      command_name VARCHAR(100) NULL,
      owner_jid VARCHAR(100) NULL,
      reminded_on DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_cs_restock_reminders_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_cs_restock_reminders_daily_customer
      ON cs_restock_reminders (user_id, customer_jid, reminded_on)
  `);
}
