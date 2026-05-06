import { addColumnIfMissing, columnExists } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "bots",
    "bot_purpose",
    "VARCHAR(32) NOT NULL DEFAULT 'main'",
  );

  if (await columnExists(pool, "bots", "bot_purpose")) {
    await pool.execute(`
      UPDATE bots
         SET bot_purpose = 'main'
       WHERE bot_purpose IS NULL OR bot_purpose = ''
    `);
    await pool.execute(`
      ALTER TABLE bots
        DROP CONSTRAINT IF EXISTS chk_bots_bot_purpose
    `);
    await pool.execute(`
      ALTER TABLE bots
        ADD CONSTRAINT chk_bots_bot_purpose
        CHECK (bot_purpose IN ('main', 'push_contact'))
    `);
    await pool.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_bots_user_purpose_online
        ON bots (user_id, bot_purpose)
       WHERE is_online = 1
    `);
  }
}
