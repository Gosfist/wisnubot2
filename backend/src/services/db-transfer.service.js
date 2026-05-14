import { getPool } from "../config/database.js";

const EXPORT_FORMAT = "wisnubot2-db-export";
const SCOPED_EXPORT_VERSION = 2;
const FULL_EXPORT_VERSION = 3;
const EXPORT_VERSION = FULL_EXPORT_VERSION;
const SUPPORTED_SCOPED_EXPORT_VERSIONS = new Set([1, SCOPED_EXPORT_VERSION]);
const SUPPORTED_FULL_EXPORT_VERSIONS = new Set([2, FULL_EXPORT_VERSION]);
const BULK_BATCH_SIZE = 300;

const SECTION_KEYS = [
  "appSettings",
  "customerService",
  "csButtons",
  "csStocks",
  "customerServiceContacts",
  "googleAccounts",
  "geminiPricePlans",
  "broadcasts",
  "broadcastTargetGroups",
  "broadcastExcludedGroups",
  "broadcastTargetBots",
  "broadcastScheduleEntries",
  "pushContactTemplates",
  "groupPushExclusions",
  "csTransactions",
  "csRelaySessions",
];

const FULL_TABLES = [
  { key: "users", table: "users", orderBy: "id" },
  { key: "bots", table: "bots", orderBy: "id", forceOffline: true },
  { key: "groups", table: "groups", orderBy: "id" },
  { key: "activityLogs", table: "activity_logs", orderBy: "id" },
  { key: "appSettings", table: "app_settings", orderBy: "user_id" },
  { key: "customerService", table: "customer_service", orderBy: "id" },
  { key: "csButtons", table: "cs_buttons", orderBy: "id" },
  { key: "csStocks", table: "cs_stocks", orderBy: "id" },
  { key: "customerServiceContacts", table: "customer_service_contacts", orderBy: "id" },
  { key: "googleAccounts", table: "google_accounts", orderBy: "id" },
  { key: "geminiPricePlans", table: "gemini_price_plans", orderBy: "id" },
  { key: "broadcasts", table: "broadcasts", orderBy: "id" },
  { key: "broadcastTargetGroups", table: "broadcast_target_groups", orderBy: "broadcast_id, group_id" },
  { key: "broadcastExcludedGroups", table: "broadcast_excluded_groups", orderBy: "broadcast_id, group_id" },
  { key: "broadcastTargetBots", table: "broadcast_target_bots", orderBy: "broadcast_id, bot_id" },
  { key: "broadcastScheduleEntries", table: "broadcast_schedule_entries", orderBy: "broadcast_id, position, schedule_time, day_key" },
  { key: "pushContactTemplates", table: "push_contact_templates", orderBy: "id" },
  { key: "groupPushExclusions", table: "group_push_exclusions", orderBy: "id" },
  { key: "pushContactRuns", table: "push_contact_runs", orderBy: "id" },
  { key: "csTransactions", table: "cs_transactions", orderBy: "id" },
  { key: "csRelaySessions", table: "cs_relay_sessions", orderBy: "id" },
];

const FULL_SECTION_KEYS = FULL_TABLES.map((item) => item.key);
const JSON_COLUMN_NAMES = new Set([
  "target_group_ids",
  "target_excluded_group_ids",
  "target_bot_ids",
  "schedule_days",
]);

const CUSTOMER_SERVICE_COLUMNS = [
  "user_id",
  "nama_perintah",
  "value",
  "created_at",
  "updated_at",
  "delivery_mode",
  "price",
  "relay_prompt",
  "relay_waiting_text",
  "relay_owner_instruction",
  "relay_done_text",
];

const CS_BUTTON_COLUMNS = [
  "cs_id",
  "label",
  "button_type",
  "target_command",
  "target_url",
  "reply_text",
  "order_index",
  "created_at",
  "price",
  "active_duration_days",
  "warranty_duration_days",
];

const CS_STOCK_COLUMNS = [
  "cs_id",
  "content",
  "is_used",
  "used_by_jid",
  "used_at",
  "created_at",
];

const CONTACT_COLUMNS = ["user_id", "contact_jid", "first_replied_at", "created_at"];
const GOOGLE_ACCOUNT_COLUMNS = ["user_id", "email", "total_slots", "created_at", "is_suspended"];
const GEMINI_PRICE_COLUMNS = ["user_id", "label", "duration_days", "price", "is_active", "created_at", "updated_at"];

const BROADCAST_COLUMNS = [
  "user_id",
  "title",
  "message_text",
  "image_url",
  "target_group_ids",
  "target_excluded_group_ids",
  "target_bot_ids",
  "schedule_time",
  "schedule_days",
  "is_active",
  "created_at",
];

const BROADCAST_GROUP_COLUMNS = ["broadcast_id", "group_id"];
const BROADCAST_SCHEDULE_COLUMNS = ["broadcast_id", "schedule_time", "day_key", "position"];
const BROADCAST_BOT_COLUMNS = ["broadcast_id", "bot_id"];
const PUSH_TEMPLATE_COLUMNS = ["user_id", "title", "message_text", "created_at", "updated_at"];
const GROUP_PUSH_EXCLUSION_COLUMNS = ["group_id", "phone_number", "label", "created_at"];

const TRANSACTION_COLUMNS = [
  "user_id",
  "cs_id",
  "customer_jid",
  "pakasir_order_id",
  "pakasir_payment_url",
  "qris_string",
  "amount",
  "status",
  "stock_id",
  "delivered_at",
  "created_at",
  "paid_at",
  "platform",
  "is_manual",
  "active_duration_days",
  "warranty_duration_days",
  "completed_at",
  "active_start_at",
  "active_expires_at",
  "warranty_start_at",
  "warranty_expires_at",
  "active_exp_notified_at",
  "warranty_exp_notified_at",
  "testimonial_sent_at",
  "google_account_id",
  "buyer_email",
  "member_status",
  "active_status",
  "gemini_price_plan_id",
  "order_status",
  "buyer_count",
  "report_status",
  "proof_drive_file_id",
  "proof_drive_url",
  "proof_uploaded_at",
];

const RELAY_SESSION_COLUMNS = [
  "transaction_id",
  "customer_jid",
  "state",
  "customer_input",
  "owner_msg_id",
  "created_at",
  "updated_at",
];

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`File import tidak valid: ${name} harus berupa array`);
  }
  return value;
}

function compactRow(row, excludedKeys = []) {
  const result = {};
  const excluded = new Set(excludedKeys);
  for (const [key, value] of Object.entries(row ?? {})) {
    if (!excluded.has(key)) result[key] = value;
  }
  return result;
}

function sectionMeta(data, keys = SECTION_KEYS) {
  return keys.map((key) => ({
    key,
    count: Array.isArray(data[key]) ? data[key].length : data[key] ? 1 : 0,
  }));
}

function chunkRows(rows, size = BULK_BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function quoteColumn(column) {
  return `"${column}"`;
}

function quoteTable(tableName) {
  if (tableName === "groups") return '"groups"';
  return tableName;
}

function escapeLiteral(value) {
  return String(value).replace(/'/g, "''");
}

async function getTableColumns(connection, tableName) {
  const [rows] = await connection.execute(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ?
      ORDER BY ordinal_position`,
    [tableName],
  );
  return rows.map((row) => String(row.column_name));
}

function normalizeFullTableRow(tableMeta, row, columns) {
  const result = {};
  for (const column of columns) {
    let value = row[column];
    if (tableMeta.forceOffline && column === "is_online") {
      value = false;
    } else if (JSON_COLUMN_NAMES.has(column)) {
      value = normalizeJsonColumn(value);
    }
    result[column] = value ?? null;
  }
  return result;
}

async function insertFullTableRows(connection, tableMeta, sourceRows) {
  const rows = requireArray(sourceRows ?? [], tableMeta.key);
  if (rows.length === 0) return 0;

  const dbColumns = await getTableColumns(connection, tableMeta.table);
  const sourceColumns = new Set(rows.flatMap((row) => Object.keys(row ?? {})));
  const columns = dbColumns.filter((column) => sourceColumns.has(column));
  if (columns.length === 0) return 0;

  const normalizedRows = rows.map((row) => normalizeFullTableRow(tableMeta, row, columns));
  await bulkInsertRows(connection, quoteTable(tableMeta.table), normalizedRows, columns);
  return normalizedRows.length;
}

async function selectFullTable(pool, tableMeta) {
  const [rows] = await pool.execute(
    `SELECT * FROM ${quoteTable(tableMeta.table)} ORDER BY ${tableMeta.orderBy}`,
  );
  return rows;
}

async function truncateFullTables(connection) {
  const tableSql = FULL_TABLES.map((item) => quoteTable(item.table)).join(", ");
  await connection.execute(`TRUNCATE TABLE ${tableSql} RESTART IDENTITY CASCADE`);
}

async function resetFullTableSequences(connection) {
  for (const tableMeta of FULL_TABLES) {
    const columns = await getTableColumns(connection, tableMeta.table);
    if (!columns.includes("id")) continue;

    const sequenceTable = tableMeta.table === "groups" ? '"groups"' : tableMeta.table;
    await connection.execute(
      `SELECT setval(
        pg_get_serial_sequence('${escapeLiteral(sequenceTable)}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${quoteTable(tableMeta.table)}), 1),
        COALESCE((SELECT MAX(id) FROM ${quoteTable(tableMeta.table)}), 0) > 0
      )`,
    );
  }
}

async function bulkInsertRows(connection, tableName, rows, columns, options = {}) {
  if (rows.length === 0) return 0;
  let inserted = 0;
  const conflictSql = options.onConflict ? ` ${options.onConflict}` : "";

  for (const batch of chunkRows(rows, options.batchSize ?? BULK_BATCH_SIZE)) {
    const params = [];
    const valuesSql = batch
      .map(() => {
        const placeholders = columns.map(() => "?");
        return `(${placeholders.join(", ")})`;
      })
      .join(", ");

    for (const row of batch) {
      for (const column of columns) {
        params.push(row[column] ?? null);
      }
    }

    const [result] = await connection.execute(
      `INSERT INTO ${tableName} (${columns.map(quoteColumn).join(", ")})
       VALUES ${valuesSql}${conflictSql}`,
      params,
    );
    inserted += Number(result.affectedRows ?? batch.length);
  }

  return inserted;
}

async function selectAll(pool, sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

function groupByBroadcastId(rows, valueKey, mapper = (value) => value) {
  const result = new Map();
  for (const row of rows) {
    const broadcastId = Number(row.broadcast_id);
    if (!result.has(broadcastId)) result.set(broadcastId, []);
    const mapped = mapper(row[valueKey]);
    if (mapped) result.get(broadcastId).push(mapped);
  }
  return result;
}

function queueByKey(rows, keyBuilder) {
  const map = new Map();
  for (const row of rows) {
    const key = keyBuilder(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function normalizeText(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function normalizeLower(value) {
  return normalizeText(value).trim().toLowerCase();
}

function normalizeJsonColumn(value) {
  if (value == null || typeof value === "string") return value ?? null;
  return JSON.stringify(value);
}

function stockKey(row) {
  return [
    Number(row.cs_id ?? 0),
    normalizeText(row.content),
    normalizeText(row.created_at),
    normalizeText(row.used_by_jid),
    normalizeText(row.used_at),
  ].join("|");
}

function broadcastKey(row) {
  return [
    normalizeText(row.title),
    normalizeText(row.message_text),
    normalizeText(row.created_at),
    normalizeText(row.schedule_time),
  ].join("|");
}

function mapInsertedIdsByQueue(originalRows, insertedRows, keyBuilder, oldIdKey = "id") {
  const queues = queueByKey(originalRows, keyBuilder);
  const map = new Map();

  for (const inserted of insertedRows) {
    const queue = queues.get(keyBuilder(inserted));
    const original = queue?.shift();
    if (original) {
      map.set(Number(original[oldIdKey]), Number(inserted.id));
    }
  }

  return map;
}

async function exportScopedForUser(user) {
  const pool = getPool();
  const userId = Number(user.id);

  const [settingsRows] = await pool.execute(
    `SELECT pakasir_slug, pakasir_api_key, testimonial_channel_link,
            testimonial_channel_jid, testimonial_channel_name,
            contact_owner_phone_number, bot_info_phone_number,
            transaction_message_template,
            google_drive_credentials_json, google_drive_client_id,
            google_drive_client_secret, google_drive_refresh_token,
            google_drive_folder_id, updated_at
       FROM app_settings
      WHERE user_id = ?
      LIMIT 1`,
    [userId],
  );

  const customerService = await selectAll(
    pool,
    `SELECT * FROM customer_service WHERE user_id = ? ORDER BY id`,
    [userId],
  );
  const csIds = customerService.map((item) => Number(item.id));
  const csIdSql = csIds.length ? csIds.map(() => "?").join(",") : "NULL";

  const csButtons = csIds.length
    ? await selectAll(pool, `SELECT * FROM cs_buttons WHERE cs_id IN (${csIdSql}) ORDER BY cs_id, order_index, id`, csIds)
    : [];
  const csStocks = csIds.length
    ? await selectAll(pool, `SELECT * FROM cs_stocks WHERE cs_id IN (${csIdSql}) ORDER BY cs_id, id`, csIds)
    : [];
  const contacts = await selectAll(
    pool,
    `SELECT * FROM customer_service_contacts WHERE user_id = ? ORDER BY id`,
    [userId],
  );
  const googleAccounts = await selectAll(
    pool,
    `SELECT * FROM google_accounts WHERE user_id = ? ORDER BY id`,
    [userId],
  );
  const geminiPricePlans = await selectAll(
    pool,
    `SELECT * FROM gemini_price_plans WHERE user_id = ? ORDER BY id`,
    [userId],
  );
  const broadcasts = await selectAll(
    pool,
    `SELECT * FROM broadcasts WHERE user_id = ? ORDER BY id`,
    [userId],
  );
  const broadcastIds = broadcasts.map((item) => Number(item.id));
  const broadcastIdSql = broadcastIds.length ? broadcastIds.map(() => "?").join(",") : "NULL";

  const broadcastTargetGroups = broadcastIds.length
    ? await selectAll(
        pool,
        `SELECT btg.broadcast_id, g.group_jid
           FROM broadcast_target_groups btg
           JOIN "groups" g ON g.id = btg.group_id
          WHERE btg.broadcast_id IN (${broadcastIdSql})
          ORDER BY btg.broadcast_id, g.group_jid`,
        broadcastIds,
      )
    : [];
  const broadcastExcludedGroups = broadcastIds.length
    ? await selectAll(
        pool,
        `SELECT beg.broadcast_id, g.group_jid
           FROM broadcast_excluded_groups beg
           JOIN "groups" g ON g.id = beg.group_id
          WHERE beg.broadcast_id IN (${broadcastIdSql})
          ORDER BY beg.broadcast_id, g.group_jid`,
        broadcastIds,
      )
    : [];
  const broadcastTargetBots = [];
  const broadcastScheduleEntries = broadcastIds.length
    ? await selectAll(
        pool,
        `SELECT broadcast_id, schedule_time, day_key, position
           FROM broadcast_schedule_entries
          WHERE broadcast_id IN (${broadcastIdSql})
          ORDER BY broadcast_id, position, schedule_time, day_key`,
        broadcastIds,
      )
    : [];

  const pushContactTemplates = await selectAll(
    pool,
    `SELECT * FROM push_contact_templates WHERE user_id = ? ORDER BY id`,
    [userId],
  );
  const groupPushExclusions = await selectAll(
    pool,
    `SELECT gpe.id, g.group_jid, gpe.phone_number, gpe.label, gpe.created_at
       FROM group_push_exclusions gpe
       JOIN "groups" g ON g.id = gpe.group_id
       JOIN bots b ON b.id = g.bot_id
      WHERE b.user_id = ?
      ORDER BY g.group_jid, gpe.phone_number`,
    [userId],
  );
  const transactions = await selectAll(
    pool,
    `SELECT * FROM cs_transactions WHERE user_id = ? ORDER BY id`,
    [userId],
  );
  const transactionIds = transactions.map((item) => Number(item.id));
  const transactionIdSql = transactionIds.length ? transactionIds.map(() => "?").join(",") : "NULL";
  const relaySessions = transactionIds.length
    ? await selectAll(
        pool,
        `SELECT * FROM cs_relay_sessions WHERE transaction_id IN (${transactionIdSql}) ORDER BY id`,
        transactionIds,
      )
    : [];

  const data = {
    appSettings: settingsRows[0] ?? null,
    customerService,
    csButtons,
    csStocks,
    customerServiceContacts: contacts,
    googleAccounts,
    geminiPricePlans,
    broadcasts,
    broadcastTargetGroups,
    broadcastExcludedGroups,
    broadcastTargetBots,
    broadcastScheduleEntries,
    pushContactTemplates,
    groupPushExclusions,
    csTransactions: transactions,
    csRelaySessions: relaySessions,
  };

  return {
    format: EXPORT_FORMAT,
    version: SCOPED_EXPORT_VERSION,
    mode: "multi-section",
    batchSize: BULK_BATCH_SIZE,
    exportedAt: new Date().toISOString(),
    sourceUser: {
      username: String(user.username ?? ""),
    },
    sections: sectionMeta(data),
    data,
  };
}

async function exportForUser(user) {
  const pool = getPool();
  const data = {};

  for (const tableMeta of FULL_TABLES) {
    data[tableMeta.key] = await selectFullTable(pool, tableMeta);
  }

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    mode: "full-database",
    batchSize: BULK_BATCH_SIZE,
    exportedAt: new Date().toISOString(),
    sourceUser: {
      id: Number(user.id),
      username: String(user.username ?? ""),
    },
    sections: sectionMeta(data, FULL_SECTION_KEYS),
    data,
  };
}

async function deleteCurrentUserData(connection, userId) {
  await connection.execute(
    `DELETE FROM group_push_exclusions
      WHERE group_id IN (
        SELECT g.id
          FROM "groups" g
          JOIN bots b ON b.id = g.bot_id
         WHERE b.user_id = ?
      )`,
    [userId],
  );

  const [transactions] = await connection.execute(
    "SELECT id FROM cs_transactions WHERE user_id = ?",
    [userId],
  );
  const transactionIds = transactions.map((row) => Number(row.id));
  if (transactionIds.length > 0) {
    await connection.execute(
      `DELETE FROM cs_relay_sessions WHERE transaction_id IN (${transactionIds.map(() => "?").join(",")})`,
      transactionIds,
    );
  }

  const [customerService] = await connection.execute(
    "SELECT id FROM customer_service WHERE user_id = ?",
    [userId],
  );
  const csIds = customerService.map((row) => Number(row.id));
  if (csIds.length > 0) {
    await connection.execute(
      `DELETE FROM cs_buttons WHERE cs_id IN (${csIds.map(() => "?").join(",")})`,
      csIds,
    );
    await connection.execute(
      `DELETE FROM cs_stocks WHERE cs_id IN (${csIds.map(() => "?").join(",")})`,
      csIds,
    );
  }

  await connection.execute("DELETE FROM cs_transactions WHERE user_id = ?", [userId]);
  await connection.execute("DELETE FROM customer_service_contacts WHERE user_id = ?", [userId]);
  await connection.execute("DELETE FROM customer_service WHERE user_id = ?", [userId]);
  await connection.execute("DELETE FROM google_accounts WHERE user_id = ?", [userId]);
  await connection.execute("DELETE FROM gemini_price_plans WHERE user_id = ?", [userId]);
  await connection.execute("DELETE FROM broadcasts WHERE user_id = ?", [userId]);
  await connection.execute("DELETE FROM push_contact_templates WHERE user_id = ?", [userId]);
  await connection.execute("DELETE FROM app_settings WHERE user_id = ?", [userId]);
}

async function loadCurrentLookup(connection, userId) {
  const [groups] = await connection.execute(
    `SELECT g.id, g.group_jid
       FROM "groups" g
       JOIN bots b ON b.id = g.bot_id
      WHERE b.user_id = ?`,
    [userId],
  );
  const [bots] = await connection.execute(
    `SELECT id, bot_purpose, phone_number, is_online
       FROM bots
      WHERE user_id = ?
        AND (phone_number IS NOT NULL OR is_online = 1)
      ORDER BY created_at DESC`,
    [userId],
  );

  const mainBotIds = bots
    .filter((row) => String(row.bot_purpose ?? "main") === "main")
    .map((row) => Number(row.id))
    .filter((id) => id > 0);
  const pushContactBotIds = bots
    .filter((row) => String(row.bot_purpose ?? "main") === "push_contact")
    .map((row) => Number(row.id))
    .filter((id) => id > 0);

  return {
    groupIdByJid: new Map(groups.map((row) => [String(row.group_jid), Number(row.id)])),
    mainBotIds,
    pushContactBotIds,
  };
}

function assertImportBotReadiness(data, lookup) {
  const broadcastCount = requireArray(data.broadcasts ?? [], "broadcasts").length;
  const pushTemplateCount = requireArray(data.pushContactTemplates ?? [], "pushContactTemplates").length;

  if (broadcastCount > 0 && lookup.mainBotIds.length === 0) {
    throw new Error("Import membutuhkan Bot 1 utama sudah ditambahkan terlebih dahulu");
  }

  if (pushTemplateCount > 0 && lookup.mainBotIds.length === 0 && lookup.pushContactBotIds.length === 0) {
    throw new Error("Import membutuhkan minimal satu bot WA sudah ditambahkan untuk fitur push kontak");
  }
}

async function importSettings(connection, userId, data) {
  if (!data.appSettings) return 0;
  const settings = compactRow(data.appSettings, ["user_id"]);
  await connection.execute(
    `INSERT INTO app_settings (
       user_id, pakasir_slug, pakasir_api_key, testimonial_channel_link,
       testimonial_channel_jid, testimonial_channel_name,
       contact_owner_phone_number, bot_info_phone_number,
       transaction_message_template, google_drive_credentials_json,
       google_drive_client_id, google_drive_client_secret,
       google_drive_refresh_token, google_drive_folder_id, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
    [
      userId,
      settings.pakasir_slug ?? null,
      settings.pakasir_api_key ?? null,
      settings.testimonial_channel_link ?? null,
      settings.testimonial_channel_jid ?? null,
      settings.testimonial_channel_name ?? null,
      settings.contact_owner_phone_number ?? null,
      settings.bot_info_phone_number ?? null,
      settings.transaction_message_template ?? null,
      settings.google_drive_credentials_json ?? null,
      settings.google_drive_client_id ?? null,
      settings.google_drive_client_secret ?? null,
      settings.google_drive_refresh_token ?? null,
      settings.google_drive_folder_id ?? null,
      settings.updated_at ?? null,
    ],
  );
  return 1;
}

async function importCustomerService(connection, userId, data) {
  const rows = requireArray(data.customerService ?? [], "customerService");
  await bulkInsertRows(
    connection,
    "customer_service",
    rows.map((row) => ({
      ...compactRow(row, ["id", "user_id"]),
      user_id: userId,
    })),
    CUSTOMER_SERVICE_COLUMNS,
  );

  const [inserted] = await connection.execute(
    "SELECT id, nama_perintah FROM customer_service WHERE user_id = ?",
    [userId],
  );
  const idByCommand = new Map(inserted.map((row) => [String(row.nama_perintah), Number(row.id)]));
  return {
    count: rows.length,
    idMap: new Map(rows.map((row) => [Number(row.id), idByCommand.get(String(row.nama_perintah))]).filter(([, id]) => id)),
  };
}

async function importCsButtons(connection, data, csIdMap) {
  const rows = requireArray(data.csButtons ?? [], "csButtons")
    .map((row) => {
      const csId = csIdMap.get(Number(row.cs_id));
      if (!csId) return null;
      return { ...compactRow(row, ["id", "cs_id"]), cs_id: csId };
    })
    .filter(Boolean);

  await bulkInsertRows(connection, "cs_buttons", rows, CS_BUTTON_COLUMNS);
  return rows.length;
}

async function importCsStocks(connection, data, csIdMap) {
  const sourceRows = requireArray(data.csStocks ?? [], "csStocks");
  const rows = sourceRows
    .map((row) => {
      const csId = csIdMap.get(Number(row.cs_id));
      if (!csId) return null;
      return { ...compactRow(row, ["id", "cs_id"]), old_id: Number(row.id), cs_id: csId };
    })
    .filter(Boolean);

  await bulkInsertRows(connection, "cs_stocks", rows, CS_STOCK_COLUMNS);

  if (rows.length === 0) {
    return { count: 0, idMap: new Map() };
  }

  const csIds = [...new Set(rows.map((row) => Number(row.cs_id)))];
  const [insertedRows] = await connection.execute(
    `SELECT * FROM cs_stocks WHERE cs_id IN (${csIds.map(() => "?").join(",")}) ORDER BY id`,
    csIds,
  );
  return {
    count: rows.length,
    idMap: mapInsertedIdsByQueue(rows, insertedRows, stockKey, "old_id"),
  };
}

async function importContacts(connection, userId, data) {
  const rows = requireArray(data.customerServiceContacts ?? [], "customerServiceContacts").map((row) => ({
    ...compactRow(row, ["id", "user_id"]),
    user_id: userId,
  }));
  await bulkInsertRows(connection, "customer_service_contacts", rows, CONTACT_COLUMNS);
  return rows.length;
}

async function importGoogleAccounts(connection, userId, data) {
  const rows = requireArray(data.googleAccounts ?? [], "googleAccounts").map((row) => ({
    ...compactRow(row, ["id", "user_id"]),
    user_id: userId,
  }));
  await bulkInsertRows(connection, "google_accounts", rows, GOOGLE_ACCOUNT_COLUMNS, {
    onConflict: `ON CONFLICT (user_id, lower(email)) DO UPDATE SET
      total_slots = EXCLUDED.total_slots,
      created_at = EXCLUDED.created_at,
      is_suspended = EXCLUDED.is_suspended`,
  });

  const [inserted] = await connection.execute(
    "SELECT id, email FROM google_accounts WHERE user_id = ?",
    [userId],
  );
  const idByEmail = new Map(inserted.map((row) => [normalizeLower(row.email), Number(row.id)]));
  return {
    count: rows.length,
    idMap: new Map(requireArray(data.googleAccounts ?? [], "googleAccounts").map((row) => [Number(row.id), idByEmail.get(normalizeLower(row.email))]).filter(([, id]) => id)),
  };
}

async function importGeminiPrices(connection, userId, data) {
  const rows = requireArray(data.geminiPricePlans ?? [], "geminiPricePlans").map((row) => ({
    ...compactRow(row, ["id", "user_id"]),
    user_id: userId,
  }));
  await bulkInsertRows(connection, "gemini_price_plans", rows, GEMINI_PRICE_COLUMNS, {
    onConflict: `ON CONFLICT (user_id, lower(label)) DO UPDATE SET
      duration_days = EXCLUDED.duration_days,
      price = EXCLUDED.price,
      is_active = EXCLUDED.is_active,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at`,
  });

  const [inserted] = await connection.execute(
    "SELECT id, label FROM gemini_price_plans WHERE user_id = ?",
    [userId],
  );
  const idByLabel = new Map(inserted.map((row) => [normalizeLower(row.label), Number(row.id)]));
  return {
    count: rows.length,
    idMap: new Map(requireArray(data.geminiPricePlans ?? [], "geminiPricePlans").map((row) => [Number(row.id), idByLabel.get(normalizeLower(row.label))]).filter(([, id]) => id)),
  };
}

async function importBroadcasts(connection, userId, data, lookup) {
  const sourceRows = requireArray(data.broadcasts ?? [], "broadcasts");
  const exportedTargetGroups = groupByBroadcastId(
    requireArray(data.broadcastTargetGroups ?? [], "broadcastTargetGroups"),
    "group_jid",
    (jid) => lookup.groupIdByJid.get(String(jid ?? "")),
  );
  const exportedExcludedGroups = groupByBroadcastId(
    requireArray(data.broadcastExcludedGroups ?? [], "broadcastExcludedGroups"),
    "group_jid",
    (jid) => lookup.groupIdByJid.get(String(jid ?? "")),
  );

  const rows = sourceRows.map((row) => {
    const oldBroadcastId = Number(row.id);
    const targetGroupIds = (exportedTargetGroups.get(oldBroadcastId) ?? []).filter(Boolean);
    const excludedGroupIds = (exportedExcludedGroups.get(oldBroadcastId) ?? []).filter(Boolean);
    return {
      ...compactRow(row, ["id", "user_id"]),
      old_id: oldBroadcastId,
      user_id: userId,
      target_group_ids: JSON.stringify(targetGroupIds),
      target_excluded_group_ids: JSON.stringify(excludedGroupIds),
      target_bot_ids: JSON.stringify(lookup.mainBotIds),
      schedule_days: normalizeJsonColumn(row.schedule_days),
    };
  });

  await bulkInsertRows(connection, "broadcasts", rows, BROADCAST_COLUMNS);

  if (rows.length === 0) {
    return { count: 0, idMap: new Map() };
  }

  const [insertedRows] = await connection.execute(
    "SELECT * FROM broadcasts WHERE user_id = ? ORDER BY id",
    [userId],
  );
  return {
    count: rows.length,
    idMap: mapInsertedIdsByQueue(rows, insertedRows, broadcastKey, "old_id"),
  };
}

async function importBroadcastRelations(connection, data, lookup, broadcastIdMap) {
  const targetGroups = requireArray(data.broadcastTargetGroups ?? [], "broadcastTargetGroups")
    .map((row) => ({
      broadcast_id: broadcastIdMap.get(Number(row.broadcast_id)),
      group_id: lookup.groupIdByJid.get(String(row.group_jid ?? "")),
    }))
    .filter((row) => row.broadcast_id && row.group_id);
  const excludedGroups = requireArray(data.broadcastExcludedGroups ?? [], "broadcastExcludedGroups")
    .map((row) => ({
      broadcast_id: broadcastIdMap.get(Number(row.broadcast_id)),
      group_id: lookup.groupIdByJid.get(String(row.group_jid ?? "")),
    }))
    .filter((row) => row.broadcast_id && row.group_id);
  const schedules = requireArray(data.broadcastScheduleEntries ?? [], "broadcastScheduleEntries")
    .map((row) => ({
      broadcast_id: broadcastIdMap.get(Number(row.broadcast_id)),
      schedule_time: String(row.schedule_time ?? ""),
      day_key: String(row.day_key ?? ""),
      position: Number(row.position ?? 0),
    }))
    .filter((row) => row.broadcast_id && row.schedule_time && row.day_key);
  const targetBots = [];
  for (const broadcastId of broadcastIdMap.values()) {
    for (const botId of lookup.mainBotIds) {
      targetBots.push({ broadcast_id: broadcastId, bot_id: botId });
    }
  }

  await bulkInsertRows(connection, "broadcast_target_groups", targetGroups, BROADCAST_GROUP_COLUMNS, {
    onConflict: "ON CONFLICT DO NOTHING",
  });
  await bulkInsertRows(connection, "broadcast_excluded_groups", excludedGroups, BROADCAST_GROUP_COLUMNS, {
    onConflict: "ON CONFLICT DO NOTHING",
  });
  await bulkInsertRows(connection, "broadcast_schedule_entries", schedules, BROADCAST_SCHEDULE_COLUMNS, {
    onConflict: "ON CONFLICT DO NOTHING",
  });
  await bulkInsertRows(connection, "broadcast_target_bots", targetBots, BROADCAST_BOT_COLUMNS, {
    onConflict: "ON CONFLICT DO NOTHING",
  });

  return {
    targetGroups: targetGroups.length,
    excludedGroups: excludedGroups.length,
    schedules: schedules.length,
    targetBots: targetBots.length,
  };
}

async function importPushTemplates(connection, userId, data) {
  const rows = requireArray(data.pushContactTemplates ?? [], "pushContactTemplates").map((row) => ({
    ...compactRow(row, ["id", "user_id"]),
    user_id: userId,
  }));
  await bulkInsertRows(connection, "push_contact_templates", rows, PUSH_TEMPLATE_COLUMNS);
  return rows.length;
}

async function importGroupPushExclusions(connection, data, lookup) {
  const rows = requireArray(data.groupPushExclusions ?? [], "groupPushExclusions")
    .map((row) => {
      const groupId = lookup.groupIdByJid.get(String(row.group_jid ?? ""));
      if (!groupId) return null;
      return {
        group_id: groupId,
        phone_number: String(row.phone_number ?? ""),
        label: row.label ?? null,
        created_at: row.created_at ?? null,
      };
    })
    .filter((row) => row && row.phone_number);

  await bulkInsertRows(connection, "group_push_exclusions", rows, GROUP_PUSH_EXCLUSION_COLUMNS, {
    onConflict: "ON CONFLICT (group_id, phone_number) DO UPDATE SET label = EXCLUDED.label",
  });
  return rows.length;
}

async function importTransactions(connection, userId, data, maps) {
  const sourceRows = requireArray(data.csTransactions ?? [], "csTransactions");
  const rows = sourceRows.map((row) => ({
    ...compactRow(row, ["id", "user_id", "cs_id", "stock_id", "google_account_id", "gemini_price_plan_id"]),
    user_id: userId,
    cs_id: row.cs_id ? maps.csIdMap.get(Number(row.cs_id)) ?? null : null,
    stock_id: row.stock_id ? maps.stockIdMap.get(Number(row.stock_id)) ?? null : null,
    google_account_id: row.google_account_id ? maps.googleIdMap.get(Number(row.google_account_id)) ?? null : null,
    gemini_price_plan_id: row.gemini_price_plan_id ? maps.pricePlanIdMap.get(Number(row.gemini_price_plan_id)) ?? null : null,
  }));

  await bulkInsertRows(connection, "cs_transactions", rows, TRANSACTION_COLUMNS);

  if (rows.length === 0) {
    return { count: 0, idMap: new Map() };
  }

  const orderIds = rows.map((row) => String(row.pakasir_order_id));
  const [insertedRows] = await connection.execute(
    `SELECT id, pakasir_order_id FROM cs_transactions WHERE pakasir_order_id IN (${orderIds.map(() => "?").join(",")})`,
    orderIds,
  );
  const idByOrderId = new Map(insertedRows.map((row) => [String(row.pakasir_order_id), Number(row.id)]));
  return {
    count: rows.length,
    idMap: new Map(sourceRows.map((row) => [Number(row.id), idByOrderId.get(String(row.pakasir_order_id))]).filter(([, id]) => id)),
  };
}

async function importRelaySessions(connection, data, txIdMap) {
  const rows = requireArray(data.csRelaySessions ?? [], "csRelaySessions")
    .map((row) => {
      const transactionId = txIdMap.get(Number(row.transaction_id));
      if (!transactionId) return null;
      return { ...compactRow(row, ["id", "transaction_id"]), transaction_id: transactionId };
    })
    .filter(Boolean);

  await bulkInsertRows(connection, "cs_relay_sessions", rows, RELAY_SESSION_COLUMNS);
  return rows.length;
}

async function importScopedForUser(user, payload) {
  if (!payload || payload.format !== EXPORT_FORMAT || !SUPPORTED_SCOPED_EXPORT_VERSIONS.has(Number(payload.version))) {
    throw new Error("File import bukan export DB WisnuBot2 yang valid");
  }

  const data = payload.data;
  if (!data || typeof data !== "object") {
    throw new Error("File import tidak memiliki data");
  }

  const userId = Number(user.id);
  const pool = getPool();
  const connection = await pool.getConnection();
  const counts = {};

  try {
    await connection.beginTransaction();
    const lookup = await loadCurrentLookup(connection, userId);
    assertImportBotReadiness(data, lookup);
    await deleteCurrentUserData(connection, userId);

    counts.appSettings = await importSettings(connection, userId, data);

    const csResult = await importCustomerService(connection, userId, data);
    counts.customerService = csResult.count;

    counts.csButtons = await importCsButtons(connection, data, csResult.idMap);

    const stockResult = await importCsStocks(connection, data, csResult.idMap);
    counts.csStocks = stockResult.count;

    counts.customerServiceContacts = await importContacts(connection, userId, data);

    const googleResult = await importGoogleAccounts(connection, userId, data);
    counts.googleAccounts = googleResult.count;

    const priceResult = await importGeminiPrices(connection, userId, data);
    counts.geminiPricePlans = priceResult.count;

    const broadcastResult = await importBroadcasts(connection, userId, data, lookup);
    counts.broadcasts = broadcastResult.count;

    const broadcastRelations = await importBroadcastRelations(connection, data, lookup, broadcastResult.idMap);
    counts.broadcastTargetGroups = broadcastRelations.targetGroups;
    counts.broadcastExcludedGroups = broadcastRelations.excludedGroups;
    counts.broadcastTargetBots = broadcastRelations.targetBots;
    counts.broadcastScheduleEntries = broadcastRelations.schedules;

    counts.pushContactTemplates = await importPushTemplates(connection, userId, data);
    counts.groupPushExclusions = await importGroupPushExclusions(connection, data, lookup);

    const txResult = await importTransactions(connection, userId, data, {
      csIdMap: csResult.idMap,
      stockIdMap: stockResult.idMap,
      googleIdMap: googleResult.idMap,
      pricePlanIdMap: priceResult.idMap,
    });
    counts.transactions = txResult.count;

    counts.csRelaySessions = await importRelaySessions(connection, data, txResult.idMap);

    await connection.commit();
    return {
      mode: "multi-section",
      batchSize: BULK_BATCH_SIZE,
      counts,
      sections: sectionMeta(data),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function importFullDatabase(payload) {
  if (!payload || payload.format !== EXPORT_FORMAT || !SUPPORTED_FULL_EXPORT_VERSIONS.has(Number(payload.version)) || payload.mode !== "full-database") {
    throw new Error("File import bukan backup full DB WisnuBot2 yang valid");
  }

  const data = payload.data;
  if (!data || typeof data !== "object") {
    throw new Error("File import tidak memiliki data");
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  const counts = {};

  try {
    await connection.beginTransaction();
    await truncateFullTables(connection);

    for (const tableMeta of FULL_TABLES) {
      counts[tableMeta.key] = await insertFullTableRows(connection, tableMeta, data[tableMeta.key] ?? []);
    }

    await resetFullTableSequences(connection);
    await connection.commit();

    return {
      mode: "full-database",
      batchSize: BULK_BATCH_SIZE,
      counts,
      sections: sectionMeta(data, FULL_SECTION_KEYS),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function importForUser(user, payload) {
  if (payload?.mode === "full-database") {
    return importFullDatabase(payload);
  }
  return importScopedForUser(user, payload);
}

export const dbTransferService = {
  exportForUser,
  importForUser,
};
