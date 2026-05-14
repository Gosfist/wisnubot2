import { getPool } from "../config/database.js";
import { columnExists, tableExists } from "./helpers/schema.js";

export async function up() {
  const pool = getPool();
  if (!(await tableExists(pool, "app_settings"))) return;
  if (!(await columnExists(pool, "app_settings", "google_drive_credentials_json"))) return;

  await pool.execute(
    `UPDATE app_settings
        SET google_drive_credentials_json = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE google_drive_credentials_json IS NOT NULL`,
  );
}

