import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(pool, "google_accounts", "category", "VARCHAR(120) NULL");
  await addColumnIfMissing(pool, "google_accounts", "subscription_expires_at", "TIMESTAMPTZ NULL");
}
