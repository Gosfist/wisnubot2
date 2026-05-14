import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(pool, "app_settings", "contact_owner_phone_number", "VARCHAR(20) NULL");
  await addColumnIfMissing(pool, "app_settings", "bot_info_phone_number", "VARCHAR(20) NULL");

  await pool.execute(`
    INSERT INTO app_settings (user_id, contact_owner_phone_number, bot_info_phone_number)
    SELECT u.id, latest.owner_phone_number, latest.owner_phone_number
      FROM users u
      JOIN LATERAL (
        SELECT owner_phone_number
          FROM bots
         WHERE user_id = u.id
           AND owner_phone_number IS NOT NULL
           AND owner_phone_number <> ''
         ORDER BY created_at DESC
         LIMIT 1
      ) latest ON true
    ON CONFLICT (user_id) DO UPDATE SET
      contact_owner_phone_number = COALESCE(app_settings.contact_owner_phone_number, EXCLUDED.contact_owner_phone_number),
      bot_info_phone_number = COALESCE(app_settings.bot_info_phone_number, EXCLUDED.bot_info_phone_number),
      updated_at = CURRENT_TIMESTAMP
  `);
}
