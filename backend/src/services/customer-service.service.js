import { getPool } from "../config/database.js";

const DEFAULT_WELCOME_VALUE = "";
const DEFAULT_START_VALUE = "";

const ENTRIES_TABLE = "customer_service";
const CONTACTS_TABLE = "customer_service_contacts";

const VALID_DELIVERY_MODES = new Set(["none", "stock", "relay"]);

function normalizeDeliveryMode(value) {
  const v = String(value ?? "none").toLowerCase();
  return VALID_DELIVERY_MODES.has(v) ? v : "none";
}

function normalizePrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function normalizeRelayPrompt(value) {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

function normalizeOptionalText(value) {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

function normalizeCommandName(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^[/.]+/, "");
}

function isResolvedContext(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "userId" in value &&
      "botId" in value,
  );
}

function buildBotContext(row) {
  return {
    botId: Number(row.id),
    userId: Number(row.user_id),
    phoneNumber: String(row.phone_number ?? ""),
    userPhoneNumber: String(row.owner_phone_number ?? row.phone_number ?? ""),
    entries: ENTRIES_TABLE,
    contacts: CONTACTS_TABLE,
  };
}

async function findBotRow(botId) {
  const numericBotId = Number(botId);
  if (!numericBotId) {
    return null;
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT b.id, b.user_id, b.phone_number, b.owner_phone_number
     FROM bots b
     WHERE b.id = ?
     LIMIT 1`,
    [numericBotId],
  );

  return rows[0] ?? null;
}

async function resolveInboundContext(botId) {
  const row = await findBotRow(botId);
  if (!row) {
    return null;
  }

  return buildBotContext(row);
}

async function resolveContext(contextOrBotId) {
  if (isResolvedContext(contextOrBotId)) {
    return contextOrBotId;
  }

  return resolveInboundContext(contextOrBotId);
}

async function ensureDefaultWelcomeForBot(contextOrBotId) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return false;
  }

  await ensureDefaultEntriesForUserId(context.userId);

  return true;
}

async function ensureDefaultEntriesForUserId(userId) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO ${ENTRIES_TABLE} (user_id, nama_perintah, value)
     VALUES (?, 'welcome', ?), (?, 'start', ?)
     ON CONFLICT (user_id, nama_perintah) DO NOTHING`,
    [Number(userId), DEFAULT_WELCOME_VALUE, Number(userId), DEFAULT_START_VALUE],
  );
}

async function listEntriesForUser(user) {
  const pool = getPool();
  await ensureDefaultEntriesForUserId(user.id);
  const [rows] = await pool.execute(
    `SELECT id, nama_perintah, value, delivery_mode, price, relay_prompt,
            relay_waiting_text, relay_owner_instruction, relay_done_text,
            created_at, updated_at
     FROM ${ENTRIES_TABLE}
     WHERE user_id = ?
     ORDER BY
       CASE nama_perintah
         WHEN 'welcome' THEN 0
         WHEN 'start' THEN 1
         ELSE 2
       END,
       nama_perintah ASC,
       id ASC`,
    [user.id],
  );

  if (rows.length === 0) {
    return [];
  }

  // Fetch buttons for these entries in one query.
  const ids = rows.map((r) => Number(r.id));
  const placeholders = ids.map(() => "?").join(", ");
  const [btnRows] = await pool.execute(
    `SELECT id, cs_id, label, button_type, target_command, target_url,
            reply_text, price, active_duration_days, warranty_duration_days,
            order_index
       FROM cs_buttons
      WHERE cs_id IN (${placeholders})
      ORDER BY order_index ASC, id ASC`,
    ids,
  );

  const buttonsByCs = new Map();
  for (const b of btnRows) {
    const csId = Number(b.cs_id);
    if (!buttonsByCs.has(csId)) buttonsByCs.set(csId, []);
    buttonsByCs.get(csId).push({
      id: Number(b.id),
      label: String(b.label),
      buttonType: String(b.button_type),
      targetCommand: b.target_command ? String(b.target_command) : null,
      targetUrl: b.target_url ? String(b.target_url) : null,
      replyText: b.reply_text ? String(b.reply_text) : null,
      price: b.price === null ? null : Number(b.price),
      activeDurationDays: b.active_duration_days === null ? null : Number(b.active_duration_days),
      warrantyDurationDays: b.warranty_duration_days === null ? null : Number(b.warranty_duration_days),
      orderIndex: Number(b.order_index ?? 0),
    });
  }

  return rows.map((row) => ({
    id: Number(row.id),
    nama_perintah: String(row.nama_perintah ?? ""),
    value: String(row.value ?? ""),
    delivery_mode: String(row.delivery_mode ?? "none"),
    price: row.price === null ? null : Number(row.price),
    relay_prompt: row.relay_prompt ? String(row.relay_prompt) : null,
    relay_waiting_text: row.relay_waiting_text ? String(row.relay_waiting_text) : null,
    relay_owner_instruction: row.relay_owner_instruction ? String(row.relay_owner_instruction) : null,
    relay_done_text: row.relay_done_text ? String(row.relay_done_text) : null,
    buttons: buttonsByCs.get(Number(row.id)) ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

async function createEntry(user, payload) {
  const commandName = normalizeCommandName(payload.namaPerintah);
  if (!commandName) {
    throw new Error("Nama perintah wajib diisi");
  }

  const value = String(payload.value ?? "").trim();
  if (!value) {
    throw new Error("Value wajib diisi");
  }

  const pool = getPool();

  const [existing] = await pool.execute(
    `SELECT id FROM ${ENTRIES_TABLE} WHERE user_id = ? AND nama_perintah = ? LIMIT 1`,
    [user.id, commandName],
  );
  if (existing.length > 0) {
    throw new Error(`Perintah "${commandName}" sudah ada`);
  }

  const deliveryMode = normalizeDeliveryMode(payload.deliveryMode);
  const price = normalizePrice(payload.price);
  const relayPrompt = normalizeRelayPrompt(payload.relayPrompt);
  const relayWaitingText = normalizeOptionalText(payload.relayWaitingText);
  const relayOwnerInstruction = normalizeOptionalText(payload.relayOwnerInstruction);
  const relayDoneText = normalizeOptionalText(payload.relayDoneText);

  const [result] = await pool.execute(
    `INSERT INTO ${ENTRIES_TABLE}
        (user_id, nama_perintah, value, delivery_mode, price, relay_prompt,
         relay_waiting_text, relay_owner_instruction, relay_done_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      commandName,
      value,
      deliveryMode,
      price,
      relayPrompt,
      relayWaitingText,
      relayOwnerInstruction,
      relayDoneText,
    ],
  );

  return {
    id: Number(result.insertId),
    nama_perintah: commandName,
    value,
    delivery_mode: deliveryMode,
    price,
    relay_prompt: relayPrompt,
    relay_waiting_text: relayWaitingText,
    relay_owner_instruction: relayOwnerInstruction,
    relay_done_text: relayDoneText,
    buttons: [],
  };
}

async function updateEntry(user, entryId, payload) {
  const numericEntryId = Number(entryId);
  if (!numericEntryId) {
    throw new Error("Entry tidak valid");
  }

  const commandName = normalizeCommandName(payload.namaPerintah);
  if (!commandName) {
    throw new Error("Nama perintah wajib diisi");
  }

  const value = String(payload.value ?? "").trim();
  if (!value) {
    throw new Error("Value wajib diisi");
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id FROM ${ENTRIES_TABLE}
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [numericEntryId, user.id],
  );

  if (rows.length === 0) {
    throw new Error("Customer service tidak ditemukan");
  }

  const [duplicate] = await pool.execute(
    `SELECT id FROM ${ENTRIES_TABLE}
     WHERE user_id = ? AND nama_perintah = ? AND id <> ?
     LIMIT 1`,
    [user.id, commandName, numericEntryId],
  );
  if (duplicate.length > 0) {
    throw new Error(`Perintah "${commandName}" sudah ada`);
  }

  const deliveryMode = normalizeDeliveryMode(payload.deliveryMode);
  const price = normalizePrice(payload.price);
  const relayPrompt = normalizeRelayPrompt(payload.relayPrompt);
  const relayWaitingText = normalizeOptionalText(payload.relayWaitingText);
  const relayOwnerInstruction = normalizeOptionalText(payload.relayOwnerInstruction);
  const relayDoneText = normalizeOptionalText(payload.relayDoneText);

  await pool.execute(
    `UPDATE ${ENTRIES_TABLE}
     SET nama_perintah = ?, value = ?, delivery_mode = ?, price = ?, relay_prompt = ?,
         relay_waiting_text = ?, relay_owner_instruction = ?, relay_done_text = ?
     WHERE id = ? AND user_id = ?`,
    [
      commandName,
      value,
      deliveryMode,
      price,
      relayPrompt,
      relayWaitingText,
      relayOwnerInstruction,
      relayDoneText,
      numericEntryId,
      user.id,
    ],
  );
}

async function deleteEntry(user, entryId) {
  const numericEntryId = Number(entryId);
  if (!numericEntryId) {
    throw new Error("Entry tidak valid");
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, nama_perintah FROM ${ENTRIES_TABLE}
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [numericEntryId, user.id],
  );

  const row = rows[0] ?? null;
  if (!row) {
    return false;
  }

  const normalizedCommand = normalizeCommandName(row.nama_perintah);
  if (normalizedCommand === "welcome" || normalizedCommand === "start") {
    throw new Error(`Perintah "${normalizedCommand}" tidak bisa dihapus`);
  }

  const [result] = await pool.execute(
    `DELETE FROM ${ENTRIES_TABLE}
     WHERE id = ? AND user_id = ?`,
    [numericEntryId, user.id],
  );

  return Number(result.affectedRows || 0) > 0;
}

async function getWelcomeMessage(contextOrBotId) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return null;
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT value FROM ${ENTRIES_TABLE}
     WHERE user_id = ? AND nama_perintah = 'welcome'
     LIMIT 1`,
    [context.userId],
  );

  return rows[0]?.value ? String(rows[0].value) : null;
}

async function getCommandMessage(contextOrBotId, commandName) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return null;
  }

  const normalizedCommandName = normalizeCommandName(commandName);
  if (!normalizedCommandName) {
    return null;
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT value FROM ${ENTRIES_TABLE}
     WHERE user_id = ? AND nama_perintah = ?
     LIMIT 1`,
    [context.userId, normalizedCommandName],
  );

  return rows[0]?.value ? String(rows[0].value) : null;
}

async function getCommandEntry(contextOrBotId, commandName) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return null;
  }

  const normalizedCommandName = normalizeCommandName(commandName);
  if (!normalizedCommandName) {
    return null;
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, user_id, nama_perintah, value, delivery_mode, price, relay_prompt,
            relay_waiting_text, relay_owner_instruction, relay_done_text
     FROM ${ENTRIES_TABLE}
     WHERE user_id = ? AND nama_perintah = ?
     LIMIT 1`,
    [context.userId, normalizedCommandName],
  );

  const row = rows[0] ?? null;
  if (!row) {
    return null;
  }

  const [buttons] = await pool.execute(
    `SELECT id, label, button_type, target_command, target_url, reply_text, price,
            active_duration_days, warranty_duration_days, order_index
       FROM cs_buttons
      WHERE cs_id = ?
      ORDER BY order_index ASC, id ASC`,
    [Number(row.id)],
  );

  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    commandName: String(row.nama_perintah ?? ""),
    value: String(row.value ?? ""),
    deliveryMode: String(row.delivery_mode ?? "none"),
    price: row.price === null ? null : Number(row.price),
    relayPrompt: row.relay_prompt ? String(row.relay_prompt) : null,
    relayWaitingText: row.relay_waiting_text ? String(row.relay_waiting_text) : null,
    relayOwnerInstruction: row.relay_owner_instruction ? String(row.relay_owner_instruction) : null,
    relayDoneText: row.relay_done_text ? String(row.relay_done_text) : null,
    buttons: buttons.map((button) => ({
      id: Number(button.id),
      label: String(button.label ?? ""),
      buttonType: String(button.button_type ?? ""),
      targetCommand: button.target_command ? String(button.target_command) : null,
      targetUrl: button.target_url ? String(button.target_url) : null,
      replyText: button.reply_text ? String(button.reply_text) : null,
      price: button.price === null ? null : Number(button.price),
      activeDurationDays: button.active_duration_days === null ? null : Number(button.active_duration_days),
      warrantyDurationDays: button.warranty_duration_days === null ? null : Number(button.warranty_duration_days),
      orderIndex: Number(button.order_index ?? 0),
    })),
  };
}

async function getButtonAction(contextOrBotId, buttonId) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return null;
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT b.id, b.cs_id, b.label, b.button_type, b.target_command,
            b.target_url, b.reply_text, b.price, b.active_duration_days,
            b.warranty_duration_days, cs.user_id
       FROM cs_buttons b
       JOIN customer_service cs ON cs.id = b.cs_id
      WHERE b.id = ? AND cs.user_id = ?
      LIMIT 1`,
    [Number(buttonId), context.userId],
  );

  const row = rows[0] ?? null;
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    csId: Number(row.cs_id),
    label: String(row.label ?? ""),
    buttonType: String(row.button_type ?? ""),
    targetCommand: row.target_command ? String(row.target_command) : null,
    targetUrl: row.target_url ? String(row.target_url) : null,
    replyText: row.reply_text ? String(row.reply_text) : null,
    price: row.price === null ? null : Number(row.price),
    activeDurationDays: row.active_duration_days === null ? null : Number(row.active_duration_days),
    warrantyDurationDays: row.warranty_duration_days === null ? null : Number(row.warranty_duration_days),
  };
}

async function getAllCommands(contextOrBotId) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return [];
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT nama_perintah, value FROM ${ENTRIES_TABLE}
     WHERE user_id = ? AND nama_perintah NOT IN ('welcome', 'start')`,
    [context.userId],
  );

  return rows.map((r) => ({
    command: String(r.nama_perintah),
    value: String(r.value),
  }));
}

/**
 * Reserve a first-reply slot so the welcome message is only sent once per contact (per user).
 */
async function reserveFirstReply(contextOrBotId, contactJid) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return false;
  }

  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO ${CONTACTS_TABLE} (user_id, contact_jid)
     VALUES (?, ?)
     ON CONFLICT (user_id, contact_jid) DO NOTHING`,
    [context.userId, String(contactJid)],
  );
  if (Number(result.affectedRows || 0) === 1) {
    return true;
  }

  const [rows] = await pool.execute(
    `SELECT first_replied_at,
            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - first_replied_at)) / 60 AS inactive_minutes
       FROM ${CONTACTS_TABLE}
      WHERE user_id = ? AND contact_jid = ?
      LIMIT 1`,
    [context.userId, String(contactJid)],
  );
  const inactiveMinutes = Number(rows[0]?.inactive_minutes ?? 0);

  await pool.execute(
    `UPDATE ${CONTACTS_TABLE}
        SET first_replied_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND contact_jid = ?`,
    [context.userId, String(contactJid)],
  );

  return inactiveMinutes >= 30;
}

async function releaseFirstReply(contextOrBotId, contactJid) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return;
  }

  const pool = getPool();
  await pool.execute(
    `DELETE FROM ${CONTACTS_TABLE} WHERE user_id = ? AND contact_jid = ?`,
    [context.userId, String(contactJid)],
  );
}

export const customerServiceService = {
  DEFAULT_WELCOME_VALUE,
  DEFAULT_START_VALUE,
  resolveInboundContext,
  ensureDefaultWelcomeForBot,
  listEntriesForUser,
  createEntry,
  updateEntry,
  deleteEntry,
  getWelcomeMessage,
  getCommandMessage,
  getCommandEntry,
  getButtonAction,
  getAllCommands,
  reserveFirstReply,
  releaseFirstReply,
};
