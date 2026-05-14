import { getPool } from "../config/database.js";
import { addColumnIfMissing } from "./helpers/schema.js";

export async function up() {
  const pool = getPool();
  await addColumnIfMissing(pool, "app_settings", "google_drive_client_id", "TEXT NULL");
  await addColumnIfMissing(pool, "app_settings", "google_drive_client_secret", "TEXT NULL");
  await addColumnIfMissing(pool, "app_settings", "google_drive_refresh_token", "TEXT NULL");
}

