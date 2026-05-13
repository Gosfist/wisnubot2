import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "google_accounts",
    "is_suspended",
    "BOOLEAN NOT NULL DEFAULT FALSE",
  );

  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_google_accounts_suspend
       ON google_accounts (user_id, is_suspended, email)`,
  );
}
