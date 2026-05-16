import { getPool } from "../config/database.js";

const VALID_TYPES = new Set([
  "link",
  "buy",
  "reply",
  "contact_owner",
  "external_link",
]);

function normalizeExternalUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const candidate = /^https?:\/\//i.test(raw)
    ? raw
    : `https://${raw.replace(/^\/+/, "")}`;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeButton(payload) {
  const type = String(payload?.buttonType ?? "").toLowerCase();
  if (!VALID_TYPES.has(type)) {
    throw new Error(
      "Tipe button tidak valid (link|buy|reply|contact_owner|external_link)",
    );
  }

  const label = String(payload?.label ?? "").trim();
  if (!label) {
    throw new Error("Label button wajib diisi");
  }

  const targetCommand =
    type === "link"
      ? String(payload?.targetCommand ?? "").trim().toLowerCase()
      : null;
  if (type === "link" && !targetCommand) {
    throw new Error("Button link wajib punya target command");
  }

  const targetUrl =
    type === "external_link"
      ? normalizeExternalUrl(payload?.targetUrl ?? payload?.target_url)
      : null;
  if (type === "external_link" && !targetUrl) {
    throw new Error("Button link external wajib punya URL yang valid");
  }

  const replyText =
    ["reply", "contact_owner"].includes(type)
      ? String(payload?.replyText ?? "").trim()
      : null;
  if (type === "reply" && !replyText) {
    throw new Error("Button reply wajib punya teks balasan");
  }
  if (type === "contact_owner" && !replyText) {
    throw new Error("Button contact owner wajib punya teks pesan");
  }

  const price =
    type === "buy" && payload?.price !== null && payload?.price !== undefined
      ? Math.floor(Number(payload.price))
      : null;
  if (type === "buy" && (!Number.isFinite(price) || price <= 0)) {
    throw new Error("Button beli wajib punya harga lebih dari 0");
  }

  const activeDurationDays =
    type === "buy" && payload?.activeDurationDays !== null && payload?.activeDurationDays !== undefined && payload?.activeDurationDays !== ""
      ? Math.floor(Number(payload.activeDurationDays))
      : null;
  if (
    type === "buy" &&
    activeDurationDays !== null &&
    (!Number.isFinite(activeDurationDays) || activeDurationDays <= 0)
  ) {
    throw new Error("Masa aktif wajib berupa jumlah hari lebih dari 0");
  }

  const warrantyDurationDays =
    type === "buy" && payload?.warrantyDurationDays !== null && payload?.warrantyDurationDays !== undefined && payload?.warrantyDurationDays !== ""
      ? Math.floor(Number(payload.warrantyDurationDays))
      : null;
  if (
    type === "buy" &&
    warrantyDurationDays !== null &&
    (!Number.isFinite(warrantyDurationDays) || warrantyDurationDays <= 0)
  ) {
    throw new Error("Masa garansi wajib berupa jumlah hari lebih dari 0");
  }

  return {
    label,
    type,
    targetCommand,
    targetUrl,
    replyText,
    price,
    activeDurationDays,
    warrantyDurationDays,
    orderIndex: Number.isFinite(Number(payload?.orderIndex))
      ? Number(payload.orderIndex)
      : 0,
  };
}

async function assertCsOwnership(csId, userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id FROM customer_service WHERE id = ? AND user_id = ? LIMIT 1`,
    [Number(csId), Number(userId)],
  );
  if (rows.length === 0) {
    throw new Error("Customer service tidak ditemukan");
  }
}

async function listForCs(csId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, cs_id, label, button_type, target_command, target_url,
            reply_text, price, active_duration_days, warranty_duration_days,
            order_index, created_at
       FROM cs_buttons
      WHERE cs_id = ?
      ORDER BY order_index ASC, id ASC`,
    [Number(csId)],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    csId: Number(row.cs_id),
    label: String(row.label),
    buttonType: String(row.button_type),
    targetCommand: row.target_command ? String(row.target_command) : null,
    targetUrl: row.target_url ? String(row.target_url) : null,
    replyText: row.reply_text ? String(row.reply_text) : null,
    price: row.price === null ? null : Number(row.price),
    activeDurationDays: row.active_duration_days === null ? null : Number(row.active_duration_days),
    warrantyDurationDays: row.warranty_duration_days === null ? null : Number(row.warranty_duration_days),
    orderIndex: Number(row.order_index ?? 0),
    createdAt: row.created_at,
  }));
}

/**
 * Replace ALL buttons for a CS entry with the given list (atomic).
 * Simpler than per-row CRUD given the editor sends the full set on save.
 */
async function replaceForCs(user, csId, buttonsRaw) {
  await assertCsOwnership(csId, user.id);
  const buttons = Array.isArray(buttonsRaw) ? buttonsRaw : [];
  const normalized = buttons.map((b, i) =>
    normalizeButton({ ...b, orderIndex: b?.orderIndex ?? i }),
  );

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM cs_buttons WHERE cs_id = ?`, [Number(csId)]);
    for (const btn of normalized) {
      await conn.execute(
        `INSERT INTO cs_buttons
           (cs_id, label, button_type, target_command, target_url, reply_text,
            price, active_duration_days, warranty_duration_days, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(csId),
          btn.label,
          btn.type,
          btn.targetCommand,
          btn.targetUrl,
          btn.replyText,
          btn.price,
          btn.activeDurationDays,
          btn.warrantyDurationDays,
          btn.orderIndex,
        ],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return listForCs(csId);
}

export const csButtonService = {
  listForCs,
  replaceForCs,
};
