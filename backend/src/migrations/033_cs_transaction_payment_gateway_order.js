import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "cs_transactions",
    "pakasir_gateway_order_id",
    "VARCHAR(120) NULL",
  );

  await pool.execute(`
    UPDATE cs_transactions
       SET pakasir_gateway_order_id = substring(pakasir_payment_url from 'order_id=([^&]+)')
     WHERE pakasir_gateway_order_id IS NULL
       AND pakasir_payment_url IS NOT NULL
       AND pakasir_payment_url LIKE '%order_id=%'
  `);

  await pool.execute(`
    CREATE INDEX IF NOT EXISTS idx_cs_tx_pakasir_gateway_order
      ON cs_transactions (pakasir_gateway_order_id)
  `);
}
