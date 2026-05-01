import { getPool } from "../config/database.js";

function maskApiKey(value) {
  if (!value) return null;
  const str = String(value);
  if (str.length <= 8) return "••••";
  return `${str.slice(0, 4)}••••${str.slice(-4)}`;
}

function rowToModel(row, { mask = true } = {}) {
  if (!row) {
    return {
      pakasirSlug: "",
      pakasirApiKey: "",
      pakasirApiKeyMasked: null,
      hasApiKey: false,
      updatedAt: null,
    };
  }
  return {
    pakasirSlug: row.pakasir_slug ? String(row.pakasir_slug) : "",
    pakasirApiKey: mask ? "" : String(row.pakasir_api_key ?? ""),
    pakasirApiKeyMasked: maskApiKey(row.pakasir_api_key),
    hasApiKey: Boolean(row.pakasir_api_key),
    updatedAt: row.updated_at,
  };
}

async function getForUser(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT pakasir_slug, pakasir_api_key, updated_at
       FROM app_settings
      WHERE user_id = ?
      LIMIT 1`,
    [user.id],
  );
  return rowToModel(rows[0]);
}

/** Internal: returns the raw record for runtime use (does NOT mask). */
async function getRawForUserId(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT pakasir_slug, pakasir_api_key, updated_at
       FROM app_settings
      WHERE user_id = ?
      LIMIT 1`,
    [Number(userId)],
  );
  return rowToModel(rows[0], { mask: false });
}

async function upsertForUser(user, payload) {
  const pakasirSlug = String(payload?.pakasirSlug ?? "").trim();
  const apiKey = String(payload?.pakasirApiKey ?? "").trim();

  const pool = getPool();
  await pool.execute(
    `INSERT INTO app_settings (user_id, pakasir_slug, pakasir_api_key)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         pakasir_slug = VALUES(pakasir_slug),
         pakasir_api_key = VALUES(pakasir_api_key)`,
    [user.id, pakasirSlug || null, apiKey || null],
  );

  return getForUser(user);
}

export const appSettingsService = {
  getForUser,
  getRawForUserId,
  upsertForUser,
};
