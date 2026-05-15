import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "customer_service",
    "payment_success_text",
    "TEXT NULL",
  );
}
