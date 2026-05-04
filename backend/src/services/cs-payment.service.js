import { getPool } from "../config/database.js";
import { appSettingsService } from "./app-settings.service.js";
import { csStockService } from "./cs-stock.service.js";
import { messageService } from "./message.service.js";
import { logger } from "../utils/logger.js";
import { existsSync, readFileSync } from "fs";

const PAKASIR_BASE_URL = "https://app.pakasir.com";
const PAID_STATUSES = new Set(["completed", "paid", "success"]);
const QRIS_ADMIN_FIXED_FEE = 310;
const QRIS_ADMIN_PERCENT = 0.007;
const QRIS_ADMIN_HIGH_AMOUNT_PERCENT = 0.01;
const QRIS_ADMIN_HIGH_AMOUNT_THRESHOLD = 105000;
const PAYMENT_EXPIRY_MINUTES = 5;
const PAYMENT_EXPIRY_MS = PAYMENT_EXPIRY_MINUTES * 60 * 1000;
const PAYMENT_SUCCESS_IMAGE_PATH = new URL("../../uploads/asset/sukses.png", import.meta.url);

function getPaymentSuccessImageBuffer() {
  if (!existsSync(PAYMENT_SUCCESS_IMAGE_PATH)) {
    logger.warn(`Payment success image not found: ${PAYMENT_SUCCESS_IMAGE_PATH.pathname}`);
    return null;
  }
  return readFileSync(PAYMENT_SUCCESS_IMAGE_PATH);
}

function normalizeJid(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return `${digits}@s.whatsapp.net`;
  if (digits.startsWith("0")) return `62${digits.slice(1)}@s.whatsapp.net`;
  if (digits.startsWith("8")) return `62${digits}@s.whatsapp.net`;
  return `${digits}@s.whatsapp.net`;
}

function buildOrderId(csId) {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CS${csId}-${stamp}${random}`;
}

function buildPaymentUrl(slug, amount, orderId) {
  const url = new URL(
    `${PAKASIR_BASE_URL}/pay/${encodeURIComponent(slug)}/${amount}`,
  );
  url.searchParams.set("order_id", orderId);
  url.searchParams.set("qris_only", "1");
  return url.toString();
}

function normalizeDurationDays(value) {
  if (value === null || value === undefined || value === "") return null;
  const days = Math.floor(Number(value));
  return Number.isFinite(days) && days > 0 ? days : null;
}

function normalizePlatform(value) {
  const platform = String(value ?? "").trim().toLowerCase();
  return platform || "whatsapp";
}

function addInclusiveDays(startDate, durationDays) {
  const days = normalizeDurationDays(durationDays);
  if (!days) return null;
  const result = new Date(startDate);
  result.setDate(result.getDate() + days - 1);
  return result;
}

function formatDateId(value, withTime = false) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function buildLifecyclePatch(startValue, activeDays, warrantyDays) {
  const start = startValue ? new Date(startValue) : new Date();
  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const activeExpiresAt = addInclusiveDays(safeStart, activeDays);
  const warrantyExpiresAt = addInclusiveDays(safeStart, warrantyDays);
  return {
    completedAt: safeStart,
    activeStartAt: activeExpiresAt ? safeStart : null,
    activeExpiresAt,
    warrantyStartAt: warrantyExpiresAt ? safeStart : null,
    warrantyExpiresAt,
  };
}

function buildTemplateData(row) {
  const idTrx = String(row.pakasir_order_id ?? row.idTrx ?? row.id_trx ?? "");
  const activeStartAt = row.active_start_at ?? row.activeStartAt ?? row.completed_at ?? row.completedAt ?? null;
  const warrantyStartAt = row.warranty_start_at ?? row.warrantyStartAt ?? row.completed_at ?? row.completedAt ?? null;
  const activeExpiresAt = row.active_expires_at ?? row.activeExpiresAt ?? null;
  const warrantyExpiresAt = row.warranty_expires_at ?? row.warrantyExpiresAt ?? null;
  const completedAt = row.completed_at ?? row.completedAt ?? row.delivered_at ?? row.deliveredAt ?? null;
  const now = new Date();

  return {
    idTrx,
    idtrx: idTrx,
    orderId: idTrx,
    produk: String(row.nama_perintah ?? row.commandName ?? ""),
    commandName: String(row.nama_perintah ?? row.commandName ?? ""),
    nomorWa: String(row.customer_jid ?? row.customerJid ?? "").replace("@s.whatsapp.net", ""),
    customerJid: String(row.customer_jid ?? row.customerJid ?? ""),
    nominal: Number(row.amount ?? 0).toLocaleString("id-ID"),
    amount: String(row.amount ?? 0),
    platform: String(row.platform ?? "whatsapp"),
    status: String(row.status ?? ""),
    jam: new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(now),
    tanggal: formatDateId(now),
    doneAt: formatDateId(completedAt, true),
    activeStart: formatDateId(activeStartAt),
    activeExp: formatDateId(activeExpiresAt),
    activeExpiresAt: formatDateId(activeExpiresAt),
    garansiStart: formatDateId(warrantyStartAt),
    garansiExp: formatDateId(warrantyExpiresAt),
    warrantyStart: formatDateId(warrantyStartAt),
    warrantyExp: formatDateId(warrantyExpiresAt),
    masaAktif: row.active_duration_days ? `${Number(row.active_duration_days)} hari` : "-",
    masaGaransi: row.warranty_duration_days ? `${Number(row.warranty_duration_days)} hari` : "-",
  };
}

function applyTemplate(text, row) {
  const source = String(text ?? "");
  if (!source) return "";
  const data = buildTemplateData(row);
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{\s*([a-zA-Z0-9_]+)\s*\}/g, (_match, a, b) => {
    const key = a || b;
    return data[key] ?? data[key?.toLowerCase?.()] ?? "";
  });
}

function calculateQrisAdminFee(amount) {
  if (amount > QRIS_ADMIN_HIGH_AMOUNT_THRESHOLD) {
    return Math.ceil(amount * QRIS_ADMIN_HIGH_AMOUNT_PERCENT);
  }

  return Math.ceil(amount * QRIS_ADMIN_PERCENT) + QRIS_ADMIN_FIXED_FEE;
}

function buildPaymentView(row) {
  const price = Number(row.amount ?? row.price ?? 0);
  const adminFee = Number.isFinite(Number(row.fee))
    ? Number(row.fee)
    : calculateQrisAdminFee(price);
  const totalPayment = Number.isFinite(Number(row.total_payment))
    ? Number(row.total_payment)
    : price + adminFee;

  const idTrx = String(row.pakasir_order_id ?? row.idTrx ?? row.id_trx ?? row.orderId ?? row.order_id ?? "");
  const createdAt = row.created_at ?? row.createdAt ?? null;
  const createdMs = createdAt ? new Date(createdAt).getTime() : NaN;
  const expiresAt = Number.isNaN(createdMs)
    ? null
    : new Date(createdMs + PAYMENT_EXPIRY_MS).toISOString();
  return {
    idTrx,
    orderId: idTrx,
    paymentUrl: String(row.pakasir_payment_url ?? row.paymentUrl ?? ""),
    qrisString: row.qris_string ? String(row.qris_string) : null,
    amount: price,
    price,
    adminFee,
    totalPayment,
    paymentMethod: "qris",
    commandName: String(row.nama_perintah ?? row.commandName ?? ""),
    expiresAt,
    expiryMinutes: PAYMENT_EXPIRY_MINUTES,
  };
}

async function createPakasirQrisPayment({ slug, apiKey, orderId, amount }) {
  const response = await fetch(
    `${PAKASIR_BASE_URL}/api/transactioncreate/qris`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project: slug,
        order_id: orderId,
        amount,
        api_key: apiKey,
      }),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      `Pakasir QRIS gagal dibuat: HTTP ${response.status}`;
    throw new Error(message);
  }

  const payment = payload?.payment;
  if (!payment?.payment_number) {
    throw new Error("Pakasir tidak mengembalikan data QRIS");
  }

  return payment;
}

async function cancelPakasirTransaction({ slug, apiKey, orderId, amount }) {
  if (!slug || !apiKey || !orderId || !amount) {
    return false;
  }

  const response = await fetch(`${PAKASIR_BASE_URL}/api/transactioncancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project: slug,
      order_id: orderId,
      amount: Number(amount),
      api_key: apiKey,
    }),
  });

  if (!response.ok) {
    throw new Error(`Pakasir cancel gagal: HTTP ${response.status}`);
  }

  return true;
}

function isPaymentExpired(transaction) {
  const createdAt = transaction?.created_at ?? transaction?.createdAt;
  if (!createdAt) return false;
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return false;
  return Date.now() - createdMs >= PAYMENT_EXPIRY_MS;
}

async function closePendingTransaction(transaction, status) {
  if (!transaction || transaction.status !== "pending") {
    return false;
  }

  const pool = getPool();
  const [currentRows] = await pool.execute(
    "SELECT status FROM cs_transactions WHERE id = ? LIMIT 1",
    [Number(transaction.id)],
  );
  if (currentRows[0]?.status !== "pending") {
    return false;
  }

  try {
    await cancelPakasirTransaction({
      slug: transaction.pakasir_slug,
      apiKey: transaction.pakasir_api_key,
      orderId: transaction.pakasir_order_id,
      amount: transaction.amount,
    });
  } catch (err) {
    logger.warn(err, `Pakasir cancel failed for ${transaction.pakasir_order_id}`);
  }

  await pool.execute(
    "UPDATE cs_transactions SET status = ? WHERE id = ? AND status = 'pending'",
    [status, Number(transaction.id)],
  );
  return true;
}

function schedulePendingExpiry(transaction) {
  const createdAt = transaction?.created_at ?? transaction?.createdAt ?? Date.now();
  const createdMs = new Date(createdAt).getTime();
  const delayMs = Math.max(
    0,
    (Number.isNaN(createdMs) ? Date.now() : createdMs) + PAYMENT_EXPIRY_MS - Date.now(),
  );

  const timer = setTimeout(() => {
    closePendingTransaction(transaction, "expired").catch((err) => {
      logger.warn(err, `Failed to expire transaction ${transaction?.pakasir_order_id ?? "-"}`);
    });
  }, delayMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

async function findPendingTransactionsForCustomer(userId, customerJid) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT tx.id, tx.user_id, tx.cs_id, tx.customer_jid, tx.pakasir_order_id,
            tx.pakasir_payment_url, tx.qris_string, tx.amount, tx.status, tx.created_at,
            tx.platform, tx.active_duration_days, tx.warranty_duration_days,
            cs.nama_perintah,
            s.pakasir_slug, s.pakasir_api_key
       FROM cs_transactions tx
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN app_settings s ON s.user_id = tx.user_id
      WHERE tx.user_id = ?
        AND tx.customer_jid = ?
        AND tx.status = 'pending'
      ORDER BY tx.created_at DESC`,
    [Number(userId), String(customerJid)],
  );
  return rows;
}

async function enforcePendingTransactionLock(userId, customerJid) {
  const pendingRows = await findPendingTransactionsForCustomer(userId, customerJid);
  for (const row of pendingRows) {
    if (isPaymentExpired(row)) {
      await closePendingTransaction(row, "expired");
      continue;
    }

    throw new Error(
      `Masih ada transaksi belum selesai (${row.pakasir_order_id}). Silakan klik Batal dulu atau tunggu Exp ${PAYMENT_EXPIRY_MINUTES} menit.`,
    );
  }
}

async function getEntryForUser(userId, csId, buttonId = null) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT cs.id, cs.user_id, cs.nama_perintah, cs.value, cs.delivery_mode,
            COALESCE(btn.price, cs.price) AS price,
            cs.relay_prompt,
            btn.active_duration_days, btn.warranty_duration_days,
            btn.id AS button_id
       FROM customer_service cs
       LEFT JOIN cs_buttons btn
         ON btn.cs_id = cs.id
        AND btn.id = ?
        AND btn.button_type = 'buy'
      WHERE cs.id = ? AND cs.user_id = ?
      LIMIT 1`,
    [buttonId ? Number(buttonId) : null, Number(csId), Number(userId)],
  );
  const row = rows[0] ?? null;
  if (row && buttonId && !row.button_id) {
    throw new Error("Button beli tidak ditemukan");
  }
  return row;
}

async function createBuyTransaction({ userId, csId, buttonId = null, customerJid }) {
  const entry = await getEntryForUser(userId, csId, buttonId);
  if (!entry) {
    throw new Error("Produk customer service tidak ditemukan");
  }

  const price = Number(entry.price ?? 0);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Harga produk belum diatur");
  }

  const settings = await appSettingsService.getRawForUserId(userId);
  if (!settings.pakasirSlug || !settings.pakasirApiKey) {
    throw new Error(
      "Slug dan API key Pakasir belum diisi, silakan isi terlebih dahulu di Settings",
    );
  }

  await enforcePendingTransactionLock(userId, customerJid);

  const orderId = buildOrderId(csId);
  const pakasirPayment = await createPakasirQrisPayment({
    slug: settings.pakasirSlug,
    apiKey: settings.pakasirApiKey,
    orderId,
    amount: price,
  });
  const adminFee = Number.isFinite(Number(pakasirPayment.fee))
    ? Number(pakasirPayment.fee)
    : calculateQrisAdminFee(price);
  const totalPayment = Number.isFinite(Number(pakasirPayment.total_payment))
    ? Number(pakasirPayment.total_payment)
    : price + adminFee;
  const paymentUrl = buildPaymentUrl(settings.pakasirSlug, price, orderId);

  const pool = getPool();
  const [insertResult] = await pool.execute(
    `INSERT INTO cs_transactions
       (user_id, cs_id, customer_jid, pakasir_order_id, pakasir_payment_url,
         qris_string, amount, platform, active_duration_days, warranty_duration_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(userId),
      Number(csId),
      String(customerJid),
      orderId,
      paymentUrl,
      String(pakasirPayment.payment_number),
      price,
      "whatsapp",
      normalizeDurationDays(entry.active_duration_days),
      normalizeDurationDays(entry.warranty_duration_days),
    ],
  );
  if (insertResult.insertId) {
    schedulePendingExpiry({
      id: insertResult.insertId,
      user_id: Number(userId),
      customer_jid: String(customerJid),
      pakasir_order_id: orderId,
      amount: price,
      status: "pending",
      created_at: new Date(),
      pakasir_slug: settings.pakasirSlug,
      pakasir_api_key: settings.pakasirApiKey,
    });
  }

  return {
    idTrx: orderId,
    orderId,
    paymentUrl,
    amount: price,
    price,
    adminFee,
    totalPayment,
    paymentMethod: "qris",
    qrisString: String(pakasirPayment.payment_number),
    commandName: String(entry.nama_perintah ?? ""),
    expiresAt: new Date(Date.now() + PAYMENT_EXPIRY_MS).toISOString(),
    expiryMinutes: PAYMENT_EXPIRY_MINUTES,
  };
}

async function createOwnerManualTransaction({
  userId,
  csId,
  buttonId = null,
  ownerJid,
  customerJid = null,
  platform,
}) {
  const entry = await getEntryForUser(userId, csId, buttonId);
  if (!entry) {
    throw new Error("Produk customer service tidak ditemukan");
  }

  const price = Number(entry.price ?? 0);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Harga produk belum diatur");
  }

  const orderId = buildOrderId(csId);
  const completedAt = new Date();
  const lifecycle = buildLifecyclePatch(
    completedAt,
    entry.active_duration_days,
    entry.warranty_duration_days,
  );
  const targetJid = normalizeJid(customerJid) || String(ownerJid);

  const pool = getPool();
  await pool.execute(
    `INSERT INTO cs_transactions
       (user_id, cs_id, customer_jid, pakasir_order_id, pakasir_payment_url,
        qris_string, amount, status, paid_at, delivered_at, platform, is_manual,
        active_duration_days, warranty_duration_days, completed_at, active_start_at,
        active_expires_at, warranty_start_at, warranty_expires_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, 'paid', ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(userId),
      Number(csId),
      targetJid,
      orderId,
      price,
      completedAt,
      completedAt,
      normalizePlatform(platform),
      normalizeDurationDays(entry.active_duration_days),
      normalizeDurationDays(entry.warranty_duration_days),
      lifecycle.completedAt,
      lifecycle.activeStartAt,
      lifecycle.activeExpiresAt,
      lifecycle.warrantyStartAt,
      lifecycle.warrantyExpiresAt,
    ],
  );

  return {
    idTrx: orderId,
    orderId,
    amount: price,
    price,
    platform: normalizePlatform(platform),
    commandName: String(entry.nama_perintah ?? ""),
    activeExpiresAt: lifecycle.activeExpiresAt ? lifecycle.activeExpiresAt.toISOString() : null,
    warrantyExpiresAt: lifecycle.warrantyExpiresAt ? lifecycle.warrantyExpiresAt.toISOString() : null,
  };
}

async function fetchPakasirStatus({ slug, apiKey, orderId, amount }) {
  if (!slug || !apiKey) {
    return null;
  }

  const url = new URL(`${PAKASIR_BASE_URL}/api/transactiondetail`);
  url.searchParams.set("project", slug);
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("order_id", orderId);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Pakasir detail gagal: HTTP ${response.status}`);
  }

  const payload = await response.json();
  return payload?.transaction ?? null;
}

async function findTransaction(orderId, amount) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT tx.id, tx.user_id, tx.cs_id, tx.customer_jid, tx.pakasir_order_id,
            tx.pakasir_payment_url, tx.qris_string, tx.amount, tx.status, tx.stock_id, tx.delivered_at, tx.created_at,
            tx.platform, tx.active_duration_days, tx.warranty_duration_days,
            tx.completed_at, tx.active_start_at, tx.active_expires_at,
            tx.warranty_start_at, tx.warranty_expires_at,
            cs.nama_perintah, cs.delivery_mode, cs.relay_prompt,
            cs.relay_waiting_text, cs.relay_owner_instruction, cs.relay_done_text,
            s.pakasir_slug, s.pakasir_api_key
       FROM cs_transactions tx
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN app_settings s ON s.user_id = tx.user_id
      WHERE tx.pakasir_order_id = ?
        AND tx.amount = ?
      LIMIT 1`,
    [String(orderId), Number(amount)],
  );
  return rows[0] ?? null;
}

async function findTransactionByOrderForUser(userId, orderId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT tx.id, tx.user_id, tx.cs_id, tx.customer_jid, tx.pakasir_order_id,
            tx.pakasir_payment_url, tx.qris_string, tx.amount, tx.status, tx.stock_id, tx.delivered_at, tx.created_at,
            tx.platform, tx.active_duration_days, tx.warranty_duration_days,
            tx.completed_at, tx.active_start_at, tx.active_expires_at,
            tx.warranty_start_at, tx.warranty_expires_at,
            cs.nama_perintah, cs.delivery_mode, cs.relay_prompt,
            s.pakasir_slug, s.pakasir_api_key
       FROM cs_transactions tx
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN app_settings s ON s.user_id = tx.user_id
      WHERE tx.user_id = ?
        AND UPPER(tx.pakasir_order_id) = UPPER(?)
      LIMIT 1`,
    [Number(userId), String(orderId)],
  );
  return rows[0] ?? null;
}

async function markPaidFromPakasir({ orderId, amount, project, status }) {
  const tx = await findTransaction(orderId, amount);
  if (!tx) {
    return {
      paid: false,
      transaction: null,
      reason: "Transaksi tidak ditemukan",
    };
  }

  if (
    project &&
    tx.pakasir_slug &&
    String(project) !== String(tx.pakasir_slug)
  ) {
    return {
      paid: false,
      transaction: tx,
      reason: "Project Pakasir tidak cocok",
    };
  }

  if (tx.status !== "pending" && tx.status !== "paid") {
    return {
      paid: false,
      transaction: tx,
      reason: `Transaksi sudah ${tx.status}`,
    };
  }

  if (tx.status === "pending" && isPaymentExpired(tx)) {
    await closePendingTransaction(tx, "expired");
    return {
      paid: false,
      transaction: tx,
      reason: `Transaksi expired setelah ${PAYMENT_EXPIRY_MINUTES} menit`,
    };
  }

  let finalStatus = String(status ?? "").toLowerCase();
  if (tx.pakasir_api_key) {
    const detail = await fetchPakasirStatus({
      slug: tx.pakasir_slug,
      apiKey: tx.pakasir_api_key,
      orderId,
      amount,
    });
    if (detail?.status) {
      finalStatus = String(detail.status).toLowerCase();
    }
  }

  if (!PAID_STATUSES.has(finalStatus)) {
    return {
      paid: false,
      transaction: tx,
      reason: `Status belum paid: ${finalStatus || "-"}`,
    };
  }

  const pool = getPool();
  await pool.execute(
    `UPDATE cs_transactions
        SET status = 'paid', paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
      WHERE id = ?`,
    [Number(tx.id)],
  );

  return {
    paid: true,
    transaction: { ...tx, status: "paid" },
    reason: null,
  };
}

async function checkAndDeliverPayment({ userId, idTrx, orderId, customerJid, sock }) {
  const trxId = idTrx ?? orderId;
  const tx = await findTransactionByOrderForUser(userId, trxId);
  if (!tx) {
    return {
      paid: false,
      reason: "Transaksi tidak ditemukan",
      transaction: null,
    };
  }

  if (customerJid && String(tx.customer_jid) !== String(customerJid)) {
    return {
      paid: false,
      reason: "Transaksi ini bukan milik nomor kamu",
      transaction: null,
    };
  }

  if (tx.status === "expired" || tx.status === "failed") {
    return {
      paid: false,
      reason: `Transaksi sudah ${tx.status === "expired" ? "expired" : "dibatalkan"}`,
      transaction: buildPaymentView(tx),
    };
  }

  if (tx.status === "paid") {
    if (tx.delivered_at) {
      await sendPaymentSuccessMessage(
        sock,
        null,
        String(tx.customer_jid),
        tx.relay_prompt ||
          "Pembayaran berhasil. Pesanan kamu sudah diproses.",
      );
      return { paid: true, reason: null, transaction: buildPaymentView(tx) };
    }
    await deliverPaidTransaction(sock, tx);
    return { paid: true, reason: null, transaction: buildPaymentView(tx) };
  }

  if (isPaymentExpired(tx)) {
    await closePendingTransaction(tx, "expired");
    return {
      paid: false,
      reason: `Transaksi expired setelah ${PAYMENT_EXPIRY_MINUTES} menit`,
      transaction: buildPaymentView(tx),
    };
  }

  const detail = await fetchPakasirStatus({
    slug: tx.pakasir_slug,
    apiKey: tx.pakasir_api_key,
    orderId: tx.pakasir_order_id,
    amount: tx.amount,
  });
  const status = String(detail?.status ?? "").toLowerCase();
  if (!PAID_STATUSES.has(status)) {
    return {
      paid: false,
      reason: `Pembayaran belum terdeteksi paid. Status: ${status || "-"}`,
      transaction: buildPaymentView(tx),
    };
  }

  const pool = getPool();
  await pool.execute(
    `UPDATE cs_transactions
        SET status = 'paid', paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
      WHERE id = ?`,
    [Number(tx.id)],
  );

  await deliverPaidTransaction(sock, { ...tx, status: "paid" });
  return { paid: true, reason: null, transaction: buildPaymentView(tx) };
}

async function cancelTransactionForCustomer({ userId, idTrx, customerJid }) {
  const tx = await findTransactionByOrderForUser(userId, idTrx);
  if (!tx) {
    return {
      cancelled: false,
      paid: false,
      message: "Transaksi tidak ditemukan",
      transaction: null,
    };
  }

  if (customerJid && String(tx.customer_jid) !== String(customerJid)) {
    return {
      cancelled: false,
      paid: false,
      message: "Transaksi ini bukan milik nomor kamu",
      transaction: null,
    };
  }

  if (tx.status === "paid") {
    return {
      cancelled: false,
      paid: true,
      message: "Transaksi sudah sukses dan tidak bisa dibatalkan.",
      transaction: buildPaymentView(tx),
    };
  }

  if (tx.status === "failed" || tx.status === "expired") {
    return {
      cancelled: true,
      paid: false,
      message: tx.status === "expired" ? "Transaksi sudah expired." : "Transaksi sudah dibatalkan.",
      transaction: buildPaymentView(tx),
    };
  }

  await closePendingTransaction(tx, isPaymentExpired(tx) ? "expired" : "failed");
  return {
    cancelled: true,
    paid: false,
    message: isPaymentExpired(tx)
      ? "Transaksi sudah expired dan dibatalkan."
      : "Transaksi berhasil dibatalkan. Kamu bisa membuat transaksi baru.",
    transaction: buildPaymentView(tx),
  };
}

async function deliverPaidTransaction(sock, transaction) {
  if (!sock || !transaction) {
    return false;
  }

  if (transaction.delivered_at) {
    return true;
  }

  const pool = getPool();
  const txId = Number(transaction.id);
  const csId = Number(transaction.cs_id);
  const customerJid = String(transaction.customer_jid);
  const mode = String(transaction.delivery_mode ?? "none");
  const deliveryLifecycle = buildLifecyclePatch(
    new Date(),
    transaction.active_duration_days,
    transaction.warranty_duration_days,
  );

  if (mode === "stock") {
    const stock = await csStockService.reserveOne(csId, customerJid);
    if (!stock) {
      await sendPaymentSuccessMessage(
        sock,
        null,
        customerJid,
        "Pembayaran berhasil, tetapi stock sedang kosong. Admin akan segera memproses pesanan kamu.",
      );
      return false;
    }

    await pool.execute(
      `UPDATE cs_transactions
          SET stock_id = ?, delivered_at = CURRENT_TIMESTAMP,
              completed_at = COALESCE(completed_at, ?),
              active_start_at = COALESCE(active_start_at, ?),
              active_expires_at = COALESCE(active_expires_at, ?),
              warranty_start_at = COALESCE(warranty_start_at, ?),
              warranty_expires_at = COALESCE(warranty_expires_at, ?)
        WHERE id = ?`,
      [
        stock.id,
        deliveryLifecycle.completedAt,
        deliveryLifecycle.activeStartAt,
        deliveryLifecycle.activeExpiresAt,
        deliveryLifecycle.warrantyStartAt,
        deliveryLifecycle.warrantyExpiresAt,
        txId,
      ],
    );
    await sendPaymentSuccessMessage(
      sock,
      null,
      customerJid,
      `Pembayaran berhasil.\n\nData pesanan kamu:\n${stock.content}`,
    );
    return true;
  }

  if (mode === "relay") {
    const prompt =
      transaction.relay_prompt ||
      "Pembayaran berhasil. Silakan kirim data yang dibutuhkan untuk pesanan ini.";
    await pool.execute(
      `INSERT INTO cs_relay_sessions (transaction_id, customer_jid, state)
       VALUES (?, ?, 'waiting_customer_input')
       ON CONFLICT (transaction_id) DO UPDATE SET state = EXCLUDED.state`,
      [txId, customerJid],
    );
    await pool.execute(
      `UPDATE cs_transactions SET delivered_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [txId],
    );
    await sendPaymentSuccessMessage(
      sock,
      null,
      customerJid,
      applyTemplate(prompt, transaction),
    );
    return true;
  }

  await pool.execute(
    `UPDATE cs_transactions
        SET delivered_at = CURRENT_TIMESTAMP,
            completed_at = COALESCE(completed_at, ?),
            active_start_at = COALESCE(active_start_at, ?),
            active_expires_at = COALESCE(active_expires_at, ?),
            warranty_start_at = COALESCE(warranty_start_at, ?),
            warranty_expires_at = COALESCE(warranty_expires_at, ?)
      WHERE id = ?`,
    [
      deliveryLifecycle.completedAt,
      deliveryLifecycle.activeStartAt,
      deliveryLifecycle.activeExpiresAt,
      deliveryLifecycle.warrantyStartAt,
      deliveryLifecycle.warrantyExpiresAt,
      txId,
    ],
  );
  await sendPaymentSuccessMessage(
    sock,
    null,
    customerJid,
    "Pembayaran berhasil. Pesanan kamu sedang diproses.",
  );
  return true;
}

async function sendPaymentSuccessMessage(sock, messageKey, jid, text) {
  const successImage = getPaymentSuccessImageBuffer();
  if (successImage) {
    return messageService.sendCustomerServiceImageMessage(
      sock,
      messageKey,
      jid,
      successImage,
      text,
    );
  }

  return messageService.sendCustomerServiceMessage(sock, messageKey, jid, text);
}

async function getWaitingRelayForCustomer(userId, customerJid) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT rs.id, rs.transaction_id, rs.customer_jid, rs.state,
            tx.user_id, tx.pakasir_order_id, tx.amount, tx.status, tx.platform,
            tx.active_duration_days, tx.warranty_duration_days,
            cs.nama_perintah, cs.relay_waiting_text,
            cs.relay_owner_instruction, cs.relay_done_text,
            COALESCE(b.owner_phone_number, b.phone_number) AS owner_phone_number
       FROM cs_relay_sessions rs
       JOIN cs_transactions tx ON tx.id = rs.transaction_id
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN bots b ON b.id = (
         SELECT id
           FROM bots
          WHERE user_id = tx.user_id
            AND is_online = 1
          ORDER BY created_at DESC
          LIMIT 1
       )
      WHERE tx.user_id = ?
        AND rs.customer_jid = ?
        AND rs.state = 'waiting_customer_input'
      ORDER BY rs.id DESC
      LIMIT 1`,
    [Number(userId), String(customerJid)],
  );
  return rows[0] ?? null;
}

async function handleCustomerRelayInput({ userId, customerJid, text, sock }) {
  const session = await getWaitingRelayForCustomer(userId, customerJid);
  if (!session) {
    return false;
  }

  const ownerJid = normalizeJid(session.owner_phone_number);
  if (!ownerJid) {
    await messageService.sendCustomerServiceMessage(
      sock,
      null,
      customerJid,
      "Data diterima, tetapi nomor owner belum diatur. Admin akan memproses manual.",
    );
    return true;
  }

  const buyerNumber = customerJid.replace("@s.whatsapp.net", "");
  const ownerInstruction =
    session.relay_owner_instruction ||
    "Reply pesan ini dengan jawaban done jika selesai.";
  const ownerMessage =
    applyTemplate(
      `Transaksi customer service perlu diproses.\n\n` +
        `idTrx: {idTrx}\n` +
        `Produk: /{produk}\n` +
        `Nomor WA: {nomorWa}\n` +
        `Platform: {platform}\n` +
        `Nominal: Rp {nominal}\n\n` +
        `Status Pembayaran: Paid\n\n` +
        `Text: ${text}\n\n` +
        ownerInstruction,
      session,
    );

  const sent = await sock.sendMessage(ownerJid, { text: ownerMessage });
  const ownerMsgId = sent?.key?.id ?? null;

  const pool = getPool();
  await pool.execute(
    `UPDATE cs_relay_sessions
        SET state = 'waiting_owner_done',
            customer_input = ?,
            owner_msg_id = ?
      WHERE id = ?`,
    [String(text), ownerMsgId, Number(session.id)],
  );

  await messageService.sendCustomerServiceMessage(
    sock,
    null,
    customerJid,
    applyTemplate(
      session.relay_waiting_text ||
        "Data sudah diterima dan diteruskan ke owner. Mohon tunggu konfirmasi.",
      session,
    ),
  );
  return true;
}

async function handleOwnerDone({
  userId,
  ownerJid,
  quotedMessageId,
  text,
  sock,
}) {
  const ownerReply = String(text ?? "").trim();
  if (!ownerReply || !quotedMessageId || ownerReply.toLowerCase() !== "done") {
    return false;
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT rs.id, rs.customer_jid, rs.customer_input,
            tx.id AS transaction_id, tx.pakasir_order_id, tx.amount, tx.status,
            tx.platform, tx.active_duration_days, tx.warranty_duration_days,
            tx.completed_at, tx.active_start_at, tx.active_expires_at,
            tx.warranty_start_at, tx.warranty_expires_at,
            cs.nama_perintah, cs.relay_done_text,
            COALESCE(b.owner_phone_number, b.phone_number) AS owner_phone_number
       FROM cs_relay_sessions rs
       JOIN cs_transactions tx ON tx.id = rs.transaction_id
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN bots b ON b.id = (
         SELECT id
           FROM bots
          WHERE user_id = tx.user_id
            AND is_online = 1
          ORDER BY created_at DESC
          LIMIT 1
       )
      WHERE tx.user_id = ?
        AND rs.state = 'waiting_owner_done'
        AND rs.owner_msg_id = ?
      ORDER BY rs.id DESC
      LIMIT 1`,
    [Number(userId), String(quotedMessageId ?? "")],
  );

  const session = rows[0] ?? null;
  if (!session) {
    return false;
  }

  const configuredOwner = normalizeJid(session.owner_phone_number);
  if (configuredOwner && configuredOwner !== ownerJid) {
    return false;
  }

  await pool.execute(
    `UPDATE cs_relay_sessions SET state = 'done' WHERE id = ?`,
    [Number(session.id)],
  );
  const lifecycle = buildLifecyclePatch(
    new Date(),
    session.active_duration_days,
    session.warranty_duration_days,
  );
  await pool.execute(
    `UPDATE cs_transactions
        SET completed_at = COALESCE(completed_at, ?),
            active_start_at = COALESCE(active_start_at, ?),
            active_expires_at = COALESCE(active_expires_at, ?),
            warranty_start_at = COALESCE(warranty_start_at, ?),
            warranty_expires_at = COALESCE(warranty_expires_at, ?)
      WHERE id = ?`,
    [
      lifecycle.completedAt,
      lifecycle.activeStartAt,
      lifecycle.activeExpiresAt,
      lifecycle.warrantyStartAt,
      lifecycle.warrantyExpiresAt,
      Number(session.transaction_id),
    ],
  );
  const completedSession = {
    ...session,
    completed_at: lifecycle.completedAt,
    active_start_at: lifecycle.activeStartAt,
    active_expires_at: lifecycle.activeExpiresAt,
    warranty_start_at: lifecycle.warrantyStartAt,
    warranty_expires_at: lifecycle.warrantyExpiresAt,
  };
  const doneText = applyTemplate(
    session.relay_done_text || "Pesanan kamu sudah selesai diproses.",
    completedSession,
  );
  await messageService.sendCustomerServiceMessage(
    sock,
    null,
    String(session.customer_jid),
    applyTemplate(
      `idTrx: {idTrx}\n` +
      `Produk: /{produk}\n` +
      `Status: Done\n` +
      `Masa Aktif: {masaAktif}\n` +
      `Exp Aktif: {activeExp}\n` +
      `Masa Garansi: {masaGaransi}\n` +
      `Exp Garansi: {garansiExp}\n` +
      `\nText: ${doneText}`,
      completedSession,
    ),
  );
  return true;
}

async function handleWebhookAndDeliver(payload, sockResolver) {
  const orderId = payload?.order_id ?? payload?.orderId;
  const amount = Number(payload?.amount);
  if (!orderId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payload webhook Pakasir tidak valid");
  }

  const result = await markPaidFromPakasir({
    orderId,
    amount,
    project: payload?.project,
    status: payload?.status,
  });

  if (!result.paid || !result.transaction) {
    logger.warn(result.reason, "Pakasir webhook ignored");
    return result;
  }

  const sock = sockResolver(Number(result.transaction.user_id));
  await deliverPaidTransaction(sock, result.transaction);
  return result;
}

async function listPaidTransactionsForUser(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT tx.id, tx.pakasir_order_id, tx.customer_jid, tx.amount,
            tx.status, tx.paid_at, tx.delivered_at, tx.created_at,
            tx.platform, tx.is_manual, tx.active_duration_days, tx.warranty_duration_days,
            tx.completed_at, tx.active_start_at, tx.active_expires_at,
            tx.warranty_start_at, tx.warranty_expires_at,
            cs.nama_perintah, st.content AS stock_content
       FROM cs_transactions tx
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN cs_stocks st ON st.id = tx.stock_id
      WHERE tx.user_id = ?
        AND tx.status = 'paid'
      ORDER BY COALESCE(tx.paid_at, tx.created_at) DESC`,
    [Number(user.id)],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    idTrx: String(row.pakasir_order_id ?? ""),
    customerJid: String(row.customer_jid ?? ""),
    amount: Number(row.amount ?? 0),
    status: String(row.status ?? ""),
    commandName: row.nama_perintah ? String(row.nama_perintah) : null,
    stockContent: row.stock_content ? String(row.stock_content) : null,
    platform: String(row.platform ?? "whatsapp"),
    isManual: Boolean(Number(row.is_manual ?? 0)),
    activeDurationDays: row.active_duration_days === null ? null : Number(row.active_duration_days),
    warrantyDurationDays: row.warranty_duration_days === null ? null : Number(row.warranty_duration_days),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    activeStartAt: row.active_start_at ? String(row.active_start_at) : null,
    activeExpiresAt: row.active_expires_at ? String(row.active_expires_at) : null,
    warrantyStartAt: row.warranty_start_at ? String(row.warranty_start_at) : null,
    warrantyExpiresAt: row.warranty_expires_at ? String(row.warranty_expires_at) : null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
  }));
}

export const csPaymentService = {
  createBuyTransaction,
  createOwnerManualTransaction,
  markPaidFromPakasir,
  deliverPaidTransaction,
  checkAndDeliverPayment,
  cancelTransactionForCustomer,
  handleCustomerRelayInput,
  handleOwnerDone,
  handleWebhookAndDeliver,
  listPaidTransactionsForUser,
};
