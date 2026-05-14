import { getPool } from "../config/database.js";
import { googleDriveService } from "./google-drive.service.js";

function maskApiKey(value) {
  if (!value) return null;
  const str = String(value);
  if (str.length <= 8) return "••••";
  return `${str.slice(0, 4)}••••${str.slice(-4)}`;
}

function rowToModel(row, { mask = true } = {}) {
  const googleDriveCredentials = row?.google_drive_credentials_json ? String(row.google_drive_credentials_json) : "";
  const googleDriveClientId = row?.google_drive_client_id ? String(row.google_drive_client_id) : "";
  const googleDriveClientSecret = row?.google_drive_client_secret ? String(row.google_drive_client_secret) : "";
  const googleDriveRefreshToken = row?.google_drive_refresh_token ? String(row.google_drive_refresh_token) : "";
  let googleDriveServiceEmail = "";
  if (googleDriveCredentials) {
    try {
      googleDriveServiceEmail = String(JSON.parse(googleDriveCredentials).client_email ?? "");
    } catch {
      googleDriveServiceEmail = "";
    }
  }

  if (!row) {
    return {
      pakasirSlug: "",
      pakasirApiKey: "",
      pakasirApiKeyMasked: null,
      hasApiKey: false,
      testimonialChannelLink: "",
      testimonialChannelJid: "",
      testimonialChannelName: "",
      testimonialChannelStatus: null,
      googleDriveCredentialsJson: "",
      googleDriveCredentialsMasked: null,
      googleDriveServiceEmail: "",
      googleDriveClientId: "",
      googleDriveClientSecret: "",
      googleDriveClientSecretMasked: null,
      googleDriveRefreshToken: "",
      googleDriveRefreshTokenMasked: null,
      googleDriveAuthMode: "none",
      googleDriveFolderId: "",
      updatedAt: null,
    };
  }
  return {
    pakasirSlug: row.pakasir_slug ? String(row.pakasir_slug) : "",
    pakasirApiKey: mask ? "" : String(row.pakasir_api_key ?? ""),
    pakasirApiKeyMasked: maskApiKey(row.pakasir_api_key),
    hasApiKey: Boolean(row.pakasir_api_key),
    testimonialChannelLink: row.testimonial_channel_link ? String(row.testimonial_channel_link) : "",
    testimonialChannelJid: row.testimonial_channel_jid ? String(row.testimonial_channel_jid) : "",
    testimonialChannelName: row.testimonial_channel_name ? String(row.testimonial_channel_name) : "",
    testimonialChannelStatus: row.testimonial_channel_status ?? null,
    googleDriveCredentialsJson: mask ? "" : googleDriveCredentials,
    googleDriveCredentialsMasked: googleDriveCredentials ? "Tersimpan" : null,
    googleDriveServiceEmail,
    googleDriveClientId: mask ? googleDriveClientId : googleDriveClientId,
    googleDriveClientSecret: mask ? "" : googleDriveClientSecret,
    googleDriveClientSecretMasked: googleDriveClientSecret ? "Tersimpan" : null,
    googleDriveRefreshToken: mask ? "" : googleDriveRefreshToken,
    googleDriveRefreshTokenMasked: googleDriveRefreshToken ? "Tersimpan" : null,
    googleDriveAuthMode: googleDriveRefreshToken ? "oauth" : "none",
    googleDriveFolderId: row.google_drive_folder_id ? String(row.google_drive_folder_id) : "",
    updatedAt: row.updated_at,
  };
}

function extractNewsletterInviteKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.endsWith("@newsletter")) return raw;

  const match = raw.match(/(?:whatsapp\.com\/channel\/|wa\.me\/channel\/)([A-Za-z0-9_-]+)/i);
  if (match?.[1]) return match[1];

  const parts = raw.split(/[/?#]/).filter(Boolean);
  return parts[parts.length - 1] ?? raw;
}

async function resolveTestimonialChannel(sock, link) {
  const key = extractNewsletterInviteKey(link);
  if (!key) {
    return {
      jid: null,
      name: null,
      status: { ok: false, message: "Link saluran testimoni belum diisi" },
    };
  }

  if (!sock) {
    return {
      jid: key.endsWith("@newsletter") ? key : null,
      name: null,
      status: { ok: false, message: "Bot utama harus online untuk cek saluran" },
    };
  }

  if (typeof sock.newsletterMetadata !== "function") {
    return {
      jid: key.endsWith("@newsletter") ? key : null,
      name: null,
      status: { ok: false, message: "Library bot belum mendukung saluran WhatsApp" },
    };
  }

  const metadataType = key.endsWith("@newsletter") ? "jid" : "invite";
  const metadata = await sock.newsletterMetadata(metadataType, key, "ADMIN");
  const jid = String(metadata?.id ?? (key.endsWith("@newsletter") ? key : ""));
  const name = String(metadata?.name ?? "");
  const role = String(metadata?.viewer_metadata?.view_role ?? "").toUpperCase();

  if (jid && typeof sock.newsletterFollow === "function") {
    await sock.newsletterFollow(jid).catch(() => null);
  }

  const isAdmin = role === "ADMIN" || role === "OWNER";
  return {
    jid,
    name,
    status: {
      ok: isAdmin,
      message: isAdmin
        ? `Bot sudah admin saluran${name ? ` ${name}` : ""}`
        : "Bot belum jadi admin saluran. Masukkan bot ke saluran lalu jadikan admin.",
    },
  };
}

async function getForUser(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT pakasir_slug, pakasir_api_key, testimonial_channel_link,
            testimonial_channel_jid, testimonial_channel_name,
            google_drive_credentials_json, google_drive_client_id,
            google_drive_client_secret, google_drive_refresh_token,
            google_drive_folder_id, updated_at
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
    `SELECT pakasir_slug, pakasir_api_key, testimonial_channel_link,
            testimonial_channel_jid, testimonial_channel_name,
            google_drive_credentials_json, google_drive_client_id,
            google_drive_client_secret, google_drive_refresh_token,
            google_drive_folder_id, updated_at
       FROM app_settings
      WHERE user_id = ?
      LIMIT 1`,
    [Number(userId)],
  );
  return rowToModel(rows[0], { mask: false });
}

async function upsertForUser(user, payload, options = {}) {
  const pakasirSlug = String(payload?.pakasirSlug ?? "").trim();
  const apiKey = String(payload?.pakasirApiKey ?? "").trim();
  const testimonialChannelLink = String(payload?.testimonialChannelLink ?? "").trim();
  const googleDriveCredentialsJson = String(payload?.googleDriveCredentialsJson ?? "").trim();
  const googleDriveClientId = String(payload?.googleDriveClientId ?? "").trim();
  const googleDriveClientSecret = String(payload?.googleDriveClientSecret ?? "").trim();
  const googleDriveRefreshToken = String(payload?.googleDriveRefreshToken ?? "").trim();
  const googleDriveFolderId = googleDriveService.normalizeFolderId(payload?.googleDriveFolderId);
  const pool = getPool();
  const channel = testimonialChannelLink
    ? await resolveTestimonialChannel(options.sock, testimonialChannelLink)
    : {
        jid: null,
        name: null,
        status: { ok: true, message: "Saluran testimoni dikosongkan" },
      };

  if (testimonialChannelLink && !channel.jid) {
    const [existingRows] = await pool.execute(
      `SELECT testimonial_channel_link, testimonial_channel_jid, testimonial_channel_name
         FROM app_settings
        WHERE user_id = ?
        LIMIT 1`,
      [user.id],
    );
    const existing = existingRows[0] ?? null;
    if (existing && String(existing.testimonial_channel_link ?? "") === testimonialChannelLink) {
      channel.jid = existing.testimonial_channel_jid || null;
      channel.name = existing.testimonial_channel_name || null;
    }
  }

  await pool.execute(
    `INSERT INTO app_settings (
       user_id, pakasir_slug, pakasir_api_key,
       testimonial_channel_link, testimonial_channel_jid, testimonial_channel_name,
       google_drive_credentials_json, google_drive_client_id, google_drive_client_secret,
       google_drive_refresh_token, google_drive_folder_id
     )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         pakasir_slug = EXCLUDED.pakasir_slug,
         pakasir_api_key = COALESCE(EXCLUDED.pakasir_api_key, app_settings.pakasir_api_key),
         testimonial_channel_link = EXCLUDED.testimonial_channel_link,
         testimonial_channel_jid = EXCLUDED.testimonial_channel_jid,
         testimonial_channel_name = EXCLUDED.testimonial_channel_name,
         google_drive_credentials_json = COALESCE(EXCLUDED.google_drive_credentials_json, app_settings.google_drive_credentials_json),
         google_drive_client_id = COALESCE(EXCLUDED.google_drive_client_id, app_settings.google_drive_client_id),
         google_drive_client_secret = COALESCE(EXCLUDED.google_drive_client_secret, app_settings.google_drive_client_secret),
         google_drive_refresh_token = COALESCE(EXCLUDED.google_drive_refresh_token, app_settings.google_drive_refresh_token),
         google_drive_folder_id = COALESCE(EXCLUDED.google_drive_folder_id, app_settings.google_drive_folder_id),
         updated_at = CURRENT_TIMESTAMP`,
    [
      user.id,
      pakasirSlug || null,
      apiKey || null,
      testimonialChannelLink || null,
      channel.jid || null,
      channel.name || null,
      googleDriveCredentialsJson || null,
      googleDriveClientId || null,
      googleDriveClientSecret || null,
      googleDriveRefreshToken || null,
      googleDriveFolderId || null,
    ],
  );

  return {
    ...(await getForUser(user)),
    testimonialChannelStatus: channel.status,
  };
}

export const appSettingsService = {
  getForUser,
  getRawForUserId,
  upsertForUser,
};
