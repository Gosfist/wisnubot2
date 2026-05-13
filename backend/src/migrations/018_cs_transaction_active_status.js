import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "cs_transactions",
    "active_status",
    "VARCHAR(16) NULL",
  );
}
