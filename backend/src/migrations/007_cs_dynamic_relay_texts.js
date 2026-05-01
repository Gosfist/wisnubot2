import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "customer_service",
    "relay_waiting_text",
    "TEXT NULL",
  );
  await addColumnIfMissing(
    pool,
    "customer_service",
    "relay_owner_instruction",
    "TEXT NULL",
  );
  await addColumnIfMissing(
    pool,
    "customer_service",
    "relay_done_text",
    "TEXT NULL",
  );
}
