import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(pool, "app_settings", "testimonial_channel_link", "TEXT NULL");
  await addColumnIfMissing(pool, "app_settings", "testimonial_channel_jid", "VARCHAR(120) NULL");
  await addColumnIfMissing(pool, "app_settings", "testimonial_channel_name", "VARCHAR(200) NULL");
  await addColumnIfMissing(pool, "cs_transactions", "testimonial_sent_at", "TIMESTAMPTZ NULL");

  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_cs_tx_testimonial_pending
       ON cs_transactions (status, testimonial_sent_at)`,
  );
}
