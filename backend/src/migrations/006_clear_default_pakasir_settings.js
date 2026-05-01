export async function up(pool) {
  await pool.execute(`
    UPDATE app_settings
       SET pakasir_slug = NULL,
           pakasir_api_key = NULL
  `);
}
