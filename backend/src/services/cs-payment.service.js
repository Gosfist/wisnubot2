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

async function getEntryForUser(userId, csId, buttonId = null) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT cs.id, cs.user_id, cs.nama_perintah, cs.value, cs.delivery_mode,
            COALESCE(btn.price, cs.price) AS price,
            cs.relay_prompt,
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
  await pool.execute(
    `INSERT INTO cs_transactions
       (user_id, cs_id, customer_jid, pakasir_order_id, pakasir_payment_url,
        qris_string, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(userId),
      Number(csId),
      String(customerJid),
      orderId,
      paymentUrl,
      String(pakasirPayment.payment_number),
      price,
    ],
  );

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
            tx.pakasir_payment_url, tx.qris_string, tx.amount, tx.status, tx.stock_id, tx.delivered_at,
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
            tx.pakasir_payment_url, tx.qris_string, tx.amount, tx.status, tx.stock_id, tx.delivered_at,
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
          SET stock_id = ?, delivered_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [stock.id, txId],
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
      prompt,
    );
    return true;
  }

  await pool.execute(
    `UPDATE cs_transactions SET delivered_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [txId],
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
            tx.user_id, tx.pakasir_order_id, tx.amount,
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
    `Transaksi customer service perlu diproses.\n\n` +
    `idTrx: ${session.pakasir_order_id}\n` +
    `Produk: /${session.nama_perintah ?? "-"}\n` +
    `Nomor WA: ${buyerNumber}\n` +
    `Nominal: Rp ${Number(session.amount ?? 0).toLocaleString("id-ID")}\n\n` +
    `Status Pembayaran: Paid\n\n` +
    `Text: ${text}\n\n` +
    ownerInstruction;

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
    session.relay_waiting_text ||
      "Data sudah diterima dan diteruskan ke owner. Mohon tunggu konfirmasi.",
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
            tx.pakasir_order_id, tx.amount,
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
  await messageService.sendCustomerServiceMessage(
    sock,
    null,
    String(session.customer_jid),
    `idTrx: ${session.pakasir_order_id}\n` +
      `Produk: /${session.nama_perintah ?? "-"}\n` +
      `Status: Done\n` +
      `\nText: ${
        session.relay_done_text || "Pesanan kamu sudah selesai diproses."
      }`,
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

export const csPaymentService = {
  createBuyTransaction,
  markPaidFromPakasir,
  deliverPaidTransaction,
  checkAndDeliverPayment,
  handleCustomerRelayInput,
  handleOwnerDone,
  handleWebhookAndDeliver,
};
