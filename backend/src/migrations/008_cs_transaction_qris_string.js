import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "cs_transactions",
    "qris_string",
    "TEXT NULL",
  );
}
