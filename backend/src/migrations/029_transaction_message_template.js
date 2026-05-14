import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(pool, "app_settings", "transaction_message_template", "TEXT NULL");
}
