import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(pool, "cs_buttons", "active_duration_days", "INT NULL");
  await addColumnIfMissing(pool, "cs_buttons", "warranty_duration_days", "INT NULL");

  await addColumnIfMissing(
    pool,
    "cs_transactions",
    "platform",
    "VARCHAR(80) NOT NULL DEFAULT 'whatsapp'",
  );
  await addColumnIfMissing(pool, "cs_transactions", "is_manual", "SMALLINT NOT NULL DEFAULT 0");
  await addColumnIfMissing(pool, "cs_transactions", "active_duration_days", "INT NULL");
  await addColumnIfMissing(pool, "cs_transactions", "warranty_duration_days", "INT NULL");
  await addColumnIfMissing(pool, "cs_transactions", "completed_at", "TIMESTAMPTZ NULL");
  await addColumnIfMissing(pool, "cs_transactions", "active_start_at", "TIMESTAMPTZ NULL");
  await addColumnIfMissing(pool, "cs_transactions", "active_expires_at", "TIMESTAMPTZ NULL");
  await addColumnIfMissing(pool, "cs_transactions", "warranty_start_at", "TIMESTAMPTZ NULL");
  await addColumnIfMissing(pool, "cs_transactions", "warranty_expires_at", "TIMESTAMPTZ NULL");

  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_cs_tx_order_search ON cs_transactions (pakasir_order_id)`,
  );
}
