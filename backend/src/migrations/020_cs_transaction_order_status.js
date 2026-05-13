import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(pool, "cs_transactions", "order_status", "VARCHAR(24) NULL");
}
