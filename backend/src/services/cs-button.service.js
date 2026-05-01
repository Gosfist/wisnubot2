import { getPool } from "../config/database.js";

const VALID_TYPES = new Set(["link", "buy", "reply"]);

function normalizeButton(payload) {
  const type = String(payload?.buttonType ?? "").toLowerCase();
  if (!VALID_TYPES.has(type)) {
    throw new Error("Tipe button tidak valid (link|buy|reply)");
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

  const replyText =
    type === "reply" ? String(payload?.replyText ?? "").trim() : null;
  if (type === "reply" && !replyText) {
    throw new Error("Button reply wajib punya teks balasan");
  }

  return {
    label,
    type,
    targetCommand,
    targetUrl: null,
    replyText,
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
            reply_text, order_index, created_at
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
           (cs_id, label, button_type, target_command, target_url, reply_text, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(csId),
          btn.label,
          btn.type,
          btn.targetCommand,
          btn.targetUrl,
          btn.replyText,
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
