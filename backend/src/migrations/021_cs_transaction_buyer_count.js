import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(pool, "cs_transactions", "buyer_count", "INT NOT NULL DEFAULT 1");

  await pool.execute(`
    UPDATE cs_transactions
       SET buyer_count = 1
     WHERE buyer_count IS NULL OR buyer_count < 1
  `);
}
