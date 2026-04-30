import { getPool } from "../config/database.js";

const DEFAULT_WELCOME_VALUE = "selamat datang di wisnu store.";

function normalizeCommandName(value = "") {
  const normalizedValue = String(value).trim().toLowerCase();
  if (normalizedValue === "start") {
    return "welcome";
  }

  return normalizedValue;
}

function getTablesForRole(role) {
  if (role === "owner") {
    return {
      entries: "customer_service_owner",
      contacts: "customer_service_owner_contacts",
    };
  }

  return {
    entries: "customer_service_user",
    contacts: "customer_service_user_contacts",
  };
}

function isResolvedContext(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "botId" in value &&
      "entries" in value &&
      "contacts" in value,
  );
}

function buildBotContext(row) {
  return {
    botId: Number(row.id),
    userId: Number(row.user_id),
    userRole: "owner",
    phoneNumber: String(row.phone_number ?? ""),
    userPhoneNumber: String(row.owner_phone_number ?? row.phone_number ?? ""),
    ...getTablesForRole("owner"),
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

/**
 * Resolve the bot to use for CS writes.
 * - Owner: always uses their broadcast bot (optionally matched by botId).
 * - User: always uses their LATEST online bot (botId from request is ignored;
 *         1 user = 1 bot).
 */
async function resolveWritableBot(user, botId) {
  const pool = getPool();

  if (user.role === "owner") {
    const numericBotId = Number(botId);
    const params = [user.id];
    let sql = `SELECT b.id, b.phone_number
       FROM bots b
       WHERE b.user_id = ?
         AND b.bot_role = 'broadcast'`;

    if (numericBotId) {
      sql += " AND b.id = ?";
      params.push(numericBotId);
    }

    sql += `
       ORDER BY b.created_at DESC
       LIMIT 1`;

    const [rows] = await pool.execute(sql, params);

    const bot = rows[0] ?? null;
    if (!bot) {
      throw new Error(
        numericBotId
          ? "Bot broadcast owner tidak ditemukan"
          : "Hubungkan bot broadcast owner terlebih dahulu",
      );
    }

    return {
      botId: Number(bot.id),
      phoneNumber: String(bot.phone_number ?? "-"),
      userRole: "owner",
    };
  }

  // For users: always auto-resolve to their active bot (ignore request botId)
  const [rows] = await pool.execute(
    `SELECT id, phone_number, bot_role
     FROM bots
     WHERE user_id = ? AND is_online = 1
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.id],
  );

  const bot = rows[0] ?? null;
  if (!bot) {
    throw new Error("Bot kamu belum terhubung. Hubungkan bot di Dashboard terlebih dahulu.");
  }
  if (String(bot.bot_role ?? "default") === "otp") {
    throw new Error("Bot OTP tidak bisa dipakai untuk customer service");
  }

  return {
    botId: Number(bot.id),
    phoneNumber: String(bot.phone_number ?? "-"),
    userRole: "user",
  };
}

async function ensureDefaultWelcomeForBot(contextOrBotId) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return false;
  }

  const pool = getPool();
  await pool.execute(
    `INSERT IGNORE INTO ${context.entries} (bot_id, nama_perintah, value)
     VALUES (?, 'welcome', ?)`,
    [context.botId, DEFAULT_WELCOME_VALUE],
  );

  return true;
}

/**
 * Re-assign all user CS entries from any old bot to the new bot.
 * Called automatically when a user's bot comes online (bot swap / new pairing).
 * No-op for owners (owner CS is always scoped to broadcast bot explicitly).
 *
 * Flow:
 *  1. Delete any auto-created entries on the NEW bot (default welcome etc.)
 *     so they don't conflict with the entries we're about to move.
 *  2. Move all entries from old bots to the new bot.
 *  3. Ensure a welcome entry exists as fallback (first-time connect).
 */
async function reassignUserCsToBot(userId, newBotId) {
  const pool = getPool();

  // Check if there are any old entries that need to be moved
  const [oldEntries] = await pool.execute(
    `SELECT cs.id FROM customer_service_user cs
     JOIN bots b ON b.id = cs.bot_id
     WHERE b.user_id = ? AND cs.bot_id <> ?`,
    [userId, newBotId],
  );

  if (oldEntries.length > 0) {
    // 1. We are in a Bot Swap scenario. Delete auto-created or conflicting entries on the new bot.
    await pool.execute(
      `DELETE FROM customer_service_user WHERE bot_id = ?`,
      [newBotId],
    );

    // 2. Move ALL entries from old bots to the new bot
    await pool.execute(
      `UPDATE customer_service_user cs
       JOIN bots b ON b.id = cs.bot_id
       SET cs.bot_id = ?
       WHERE b.user_id = ? AND cs.bot_id <> ?`,
      [newBotId, userId, newBotId],
    );
  }

  // 3. Ensure welcome exists (for first-time connects where no old data existed, or fallback)
  await pool.execute(
    `INSERT IGNORE INTO customer_service_user (bot_id, nama_perintah, value)
     VALUES (?, 'welcome', ?)`,
    [newBotId, DEFAULT_WELCOME_VALUE],
  );
}

async function listEntriesForUser(user) {
  const pool = getPool();
  const tables = getTablesForRole(user.role);
  const clauses = ["b.user_id = ?"];
  const params = [user.id];

  if (user.role === "owner") {
    clauses.push("b.bot_role = 'broadcast'");
  }

  const [rows] = await pool.execute(
    `SELECT cs.id, cs.bot_id, b.phone_number, cs.nama_perintah, cs.value, cs.created_at, cs.updated_at
     FROM ${tables.entries} cs
     JOIN bots b ON b.id = cs.bot_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY b.created_at DESC, cs.id ASC`,
    params,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    bot_id: Number(row.bot_id),
    phone_number: String(row.phone_number ?? "-"),
    nama_perintah: String(row.nama_perintah ?? ""),
    value: String(row.value ?? ""),
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

  const writableBot = await resolveWritableBot(user, payload.botId);
  const tables = getTablesForRole(user.role);
  const pool = getPool();

  const [existing] = await pool.execute(
    `SELECT id FROM ${tables.entries} WHERE bot_id = ? AND nama_perintah = ? LIMIT 1`,
    [writableBot.botId, commandName],
  );
  if (existing.length > 0) {
    throw new Error(`Perintah "${commandName}" sudah ada untuk bot ini`);
  }

  const [result] = await pool.execute(
    `INSERT INTO ${tables.entries} (bot_id, nama_perintah, value)
     VALUES (?, ?, ?)`,
    [writableBot.botId, commandName, value],
  );

  return {
    id: Number(result.insertId),
    bot_id: writableBot.botId,
    phone_number: writableBot.phoneNumber,
    nama_perintah: commandName,
    value,
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

  const tables = getTablesForRole(user.role);
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT cs.id, cs.bot_id
     FROM ${tables.entries} cs
     JOIN bots b ON b.id = cs.bot_id
     WHERE cs.id = ? AND b.user_id = ? ${user.role === "owner" ? "AND b.bot_role = 'broadcast'" : ""}
     LIMIT 1`,
    [numericEntryId, user.id],
  );

  const row = rows[0] ?? null;
  if (!row) {
    throw new Error("Customer service tidak ditemukan");
  }

  const targetBot = await resolveWritableBot(user, payload.botId ?? row.bot_id);
  const [duplicate] = await pool.execute(
    `SELECT id FROM ${tables.entries}
     WHERE bot_id = ? AND nama_perintah = ? AND id <> ?
     LIMIT 1`,
    [targetBot.botId, commandName, numericEntryId],
  );
  if (duplicate.length > 0) {
    throw new Error(`Perintah "${commandName}" sudah ada untuk bot ini`);
  }

  await pool.execute(
    `UPDATE ${tables.entries}
     SET bot_id = ?, nama_perintah = ?, value = ?
     WHERE id = ?`,
    [targetBot.botId, commandName, value, numericEntryId],
  );
}

async function deleteEntry(user, entryId) {
  const numericEntryId = Number(entryId);
  if (!numericEntryId) {
    throw new Error("Entry tidak valid");
  }

  const tables = getTablesForRole(user.role);
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT cs.id, cs.nama_perintah
     FROM ${tables.entries} cs
     JOIN bots b ON b.id = cs.bot_id
     WHERE cs.id = ? AND b.user_id = ? ${user.role === "owner" ? "AND b.bot_role = 'broadcast'" : ""}
     LIMIT 1`,
    [numericEntryId, user.id],
  );

  const row = rows[0] ?? null;
  if (!row) {
    return false;
  }

  if (normalizeCommandName(row.nama_perintah) === "welcome") {
    throw new Error('Perintah "welcome" tidak bisa dihapus');
  }

  const [result] = await pool.execute(
    `DELETE cs
     FROM ${tables.entries} cs
     JOIN bots b ON b.id = cs.bot_id
     WHERE cs.id = ? AND b.user_id = ? ${user.role === "owner" ? "AND b.bot_role = 'broadcast'" : ""}`,
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
    `SELECT value FROM ${context.entries}
     WHERE bot_id = ? AND nama_perintah = 'welcome'
     LIMIT 1`,
    [context.botId],
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
    `SELECT value FROM ${context.entries}
     WHERE bot_id = ? AND nama_perintah = ?
     LIMIT 1`,
    [context.botId, normalizedCommandName],
  );

  return rows[0]?.value ? String(rows[0].value) : null;
}

async function getAllCommands(contextOrBotId) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return [];
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT nama_perintah, value FROM ${context.entries}
     WHERE bot_id = ? AND nama_perintah != 'welcome'`,
    [context.botId],
  );

  return rows.map((r) => ({
    command: String(r.nama_perintah),
    value: String(r.value),
  }));
}

/**
 * Reserve a first-reply slot so the welcome message is only sent once per contact.
 * For users: keyed by user_id (contacts table now uses user_id).
 * For owners: keyed by bot_id (unchanged).
 */
async function reserveFirstReply(contextOrBotId, contactJid) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return false;
  }

  const pool = getPool();

  if (context.userRole !== "owner") {
    // User contacts table uses user_id
    const [result] = await pool.execute(
      `INSERT IGNORE INTO ${context.contacts} (user_id, contact_jid)
       VALUES (?, ?)`,
      [context.userId, String(contactJid)],
    );
    return Number(result.affectedRows || 0) === 1;
  }

  // Owner contacts table still uses bot_id
  const [result] = await pool.execute(
    `INSERT IGNORE INTO ${context.contacts} (bot_id, contact_jid)
     VALUES (?, ?)`,
    [context.botId, String(contactJid)],
  );
  return Number(result.affectedRows || 0) === 1;
}

async function releaseFirstReply(contextOrBotId, contactJid) {
  const context = await resolveContext(contextOrBotId);
  if (!context) {
    return;
  }

  const pool = getPool();

  if (context.userRole !== "owner") {
    await pool.execute(
      `DELETE FROM ${context.contacts} WHERE user_id = ? AND contact_jid = ?`,
      [context.userId, String(contactJid)],
    );
    return;
  }

  await pool.execute(
    `DELETE FROM ${context.contacts} WHERE bot_id = ? AND contact_jid = ?`,
    [context.botId, String(contactJid)],
  );
}

export const customerServiceService = {
  DEFAULT_WELCOME_VALUE,
  resolveInboundContext,
  ensureDefaultWelcomeForBot,
  reassignUserCsToBot,
  listEntriesForUser,
  createEntry,
  updateEntry,
  deleteEntry,
  getWelcomeMessage,
  getCommandMessage,
  getAllCommands,
  reserveFirstReply,
  releaseFirstReply,
};
