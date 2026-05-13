import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS google_accounts (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      email VARCHAR(255) NOT NULL,
      total_slots INT NOT NULL DEFAULT 5,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_google_accounts_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_google_accounts_user ON google_accounts (user_id, created_at)`,
  );

  await addColumnIfMissing(pool, "cs_transactions", "google_account_id", "INT NULL");
  await addColumnIfMissing(pool, "cs_transactions", "buyer_email", "VARCHAR(255) NULL");
  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_cs_tx_google_account ON cs_transactions (google_account_id)`,
  );
}
