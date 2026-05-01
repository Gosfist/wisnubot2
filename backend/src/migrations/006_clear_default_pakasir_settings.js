import { tableExists } from "./helpers/schema.js";

export async function up(pool) {
  if (!(await tableExists(pool, "app_settings"))) {
    return;
  }

  await pool.execute(`
    UPDATE app_settings
       SET pakasir_slug = NULL,
           pakasir_api_key = NULL
  `);
}
