import { getPool } from "../config/database.js";
import { appSettingsService } from "./app-settings.service.js";
import { csStockService } from "./cs-stock.service.js";
import { messageService } from "./message.service.js";
import { logger } from "../utils/logger.js";

const PAKASIR_BASE_URL = "https://app.pakasir.com";
const PAID_STATUSES = new Set(["completed", "paid", "success"]);

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
  const url = new URL(`${PAKASIR_BASE_URL}/pay/${encodeURIComponent(slug)}/${amount}`);
  url.searchParams.set("order_id", orderId);
  return url.toString();
}

async function getEntryForUser(userId, csId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, user_id, nama_perintah, value, delivery_mode, price, relay_prompt
       FROM customer_service
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
    [Number(csId), Number(userId)],
  );
  return rows[0] ?? null;
}

async function createBuyTransaction({ userId, csId, customerJid }) {
  const entry = await getEntryForUser(userId, csId);
  if (!entry) {
    throw new Error("Produk customer service tidak ditemukan");
  }

  const amount = Number(entry.price ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Harga produk belum diatur");
  }

  const settings = await appSettingsService.getRawForUserId(userId);
  if (!settings.pakasirSlug) {
    throw new Error("Slug Pakasir belum diatur di Pengaturan");
  }

  const orderId = buildOrderId(csId);
  const paymentUrl = buildPaymentUrl(settings.pakasirSlug, amount, orderId);

  const pool = getPool();
  await pool.execute(
    `INSERT INTO cs_transactions
       (user_id, cs_id, customer_jid, pakasir_order_id, pakasir_payment_url, amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [Number(userId), Number(csId), String(customerJid), orderId, paymentUrl, amount],
  );

  return {
    orderId,
    paymentUrl,
    amount,
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
            tx.pakasir_payment_url, tx.amount, tx.status, tx.stock_id, tx.delivered_at,
            cs.nama_perintah, cs.delivery_mode, cs.relay_prompt,
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

async function markPaidFromPakasir({ orderId, amount, project, status }) {
  const tx = await findTransaction(orderId, amount);
  if (!tx) {
    return { paid: false, transaction: null, reason: "Transaksi tidak ditemukan" };
  }

  if (project && tx.pakasir_slug && String(project) !== String(tx.pakasir_slug)) {
    return { paid: false, transaction: tx, reason: "Project Pakasir tidak cocok" };
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
    return { paid: false, transaction: tx, reason: `Status belum paid: ${finalStatus || "-"}` };
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
      await messageService.sendCustomerServiceMessage(
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
    await messageService.sendCustomerServiceMessage(
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
       ON DUPLICATE KEY UPDATE state = VALUES(state)`,
      [txId, customerJid],
    );
    await pool.execute(
      `UPDATE cs_transactions SET delivered_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [txId],
    );
    await messageService.sendCustomerServiceMessage(sock, null, customerJid, prompt);
    return true;
  }

  await pool.execute(
    `UPDATE cs_transactions SET delivered_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [txId],
  );
  await messageService.sendCustomerServiceMessage(
    sock,
    null,
    customerJid,
    "Pembayaran berhasil. Pesanan kamu sedang diproses.",
  );
  return true;
}

async function getWaitingRelayForCustomer(userId, customerJid) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT rs.id, rs.transaction_id, rs.customer_jid, rs.state,
            tx.user_id, tx.pakasir_order_id, tx.amount,
            cs.nama_perintah,
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

  const ownerMessage =
    `Transaksi customer service perlu diproses.\n\n` +
    `Order ID: ${session.pakasir_order_id}\n` +
    `Produk: /${session.nama_perintah ?? "-"}\n` +
    `Customer: ${customerJid.replace("@s.whatsapp.net", "")}\n` +
    `Nominal: Rp ${Number(session.amount ?? 0).toLocaleString("id-ID")}\n\n` +
    `Data customer:\n${text}\n\n` +
    `Reply pesan ini dengan: done`;

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
    "Data sudah diterima dan diteruskan ke owner. Mohon tunggu konfirmasi.",
  );
  return true;
}

async function handleOwnerDone({ userId, ownerJid, quotedMessageId, text, sock }) {
  if (String(text ?? "").trim().toLowerCase() !== "done") {
    return false;
  }

  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT rs.id, rs.customer_jid,
            COALESCE(b.owner_phone_number, b.phone_number) AS owner_phone_number
       FROM cs_relay_sessions rs
       JOIN cs_transactions tx ON tx.id = rs.transaction_id
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
    "Done. Pesanan kamu sudah selesai diproses.",
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
  handleCustomerRelayInput,
  handleOwnerDone,
  handleWebhookAndDeliver,
};
