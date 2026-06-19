export async function up(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS google_account_categories (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_google_account_categories_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_google_account_categories_user_name
      ON google_account_categories (user_id, lower(name))
  `);
}
