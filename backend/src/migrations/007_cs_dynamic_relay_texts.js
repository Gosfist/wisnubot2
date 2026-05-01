import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "customer_service",
    "relay_waiting_text",
    "TEXT NULL AFTER relay_prompt",
  );
  await addColumnIfMissing(
    pool,
    "customer_service",
    "relay_owner_instruction",
    "TEXT NULL AFTER relay_waiting_text",
  );
  await addColumnIfMissing(
    pool,
    "customer_service",
    "relay_done_text",
    "TEXT NULL AFTER relay_owner_instruction",
  );
}
