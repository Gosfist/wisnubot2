import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS gemini_price_plans (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      label VARCHAR(120) NOT NULL,
      duration_days INT NOT NULL,
      price INT NOT NULL,
      is_active SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_gemini_price_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_gemini_price_user ON gemini_price_plans (user_id, is_active, duration_days)`,
  );

  await addColumnIfMissing(pool, "cs_transactions", "gemini_price_plan_id", "INT NULL");
}
