import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(pool, "cs_transactions", "active_exp_notified_at", "TIMESTAMPTZ NULL");
  await addColumnIfMissing(pool, "cs_transactions", "warranty_exp_notified_at", "TIMESTAMPTZ NULL");

  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_cs_tx_active_exp_notify
       ON cs_transactions (active_expires_at, active_exp_notified_at)`,
  );
  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_cs_tx_warranty_exp_notify
       ON cs_transactions (warranty_expires_at, warranty_exp_notified_at)`,
  );
}
