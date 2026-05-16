import { getPool } from "../config/database.js";
import { appSettingsService } from "./app-settings.service.js";
import { csStockService } from "./cs-stock.service.js";
import { geminiPriceService } from "./gemini-price.service.js";
import { googleDriveService } from "./google-drive.service.js";
import { messageService } from "./message.service.js";
import { realtimeService } from "./realtime.service.js";
import { logger } from "../utils/logger.js";
import {
  getNewsletterViewerRole,
  isNewsletterAdminRole,
} from "../utils/newsletter.js";

const PAKASIR_BASE_URL = "https://app.pakasir.com";
const PAID_STATUSES = new Set(["completed", "paid", "success"]);
const QRIS_ADMIN_FIXED_FEE = 310;
const QRIS_ADMIN_PERCENT = 0.007;
const QRIS_ADMIN_HIGH_AMOUNT_PERCENT = 0.01;
const QRIS_ADMIN_HIGH_AMOUNT_THRESHOLD = 105000;
const PAYMENT_EXPIRY_MINUTES = 5;
const PAYMENT_EXPIRY_MS = PAYMENT_EXPIRY_MINUTES * 60 * 1000;
const DEFAULT_TRANSACTION_MESSAGE_TEMPLATE = [
  "Transaksi selesai",
  "",
  "ID Trx: {idTrx}",
  "Produk: {produk}",
  "Akun Google: {akunGoogle}",
  "Email: {emailBuyer}",
  "Platform: {platform}",
  "Nominal: Rp {nominal}",
  "Masa Aktif: {activeStart} - {activeExp}",
  "Garansi: {garansiExp}",
  "Saluran: {saluran}",
].join("\n");
const DEFAULT_WHATSAPP_TRANSACTION_MESSAGE_TEMPLATE = [
  "Transaksi selesai",
  "",
  "ID Trx: {idTrx}",
  "Produk: {produk}",
  "Akun Google: {akunGoogle}",
  "Email: {emailBuyer}",
  "Nominal: Rp {nominal}",
  "Masa Aktif: {activeStart} - {activeExp}",
  "Garansi: {garansiExp}",
  "Saluran: {saluran}",
].join("\n");

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

function buildPakasirGatewayOrderId(csId) {
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
  const platform = String(value ?? "")
    .trim()
    .toLowerCase();
  return platform || "whatsapp";
}

function isValidManualPlatform(value) {
  return ["shopee", "whatsapp"].includes(value);
}

function normalizeActiveStatus(value) {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!status) return null;
  return status === "expired" ? "expired" : "aktif";
}

function normalizeOrderStatus(value) {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!status) return null;
  return status === "dikirim" ? "dikirim" : "selesai";
}

function normalizeReportStatus(value) {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();
  return status === "selesai" ? "selesai" : "proses";
}

function normalizeReportStatusForPlatform(platform, value) {
  return normalizePlatform(platform) === "shopee"
    ? normalizeReportStatus(value)
    : "selesai";
}

function isReportReadyForTestimonial(value) {
  return normalizeReportStatus(value) === "selesai";
}

function isPrivateTestimonialPlatform(value) {
  return normalizePlatform(value) === "pribadi";
}

function mapPaidTransactionRow(row) {
  return {
    id: Number(row.id),
    idTrx: String(row.pakasir_order_id ?? ""),
    paymentGatewayOrderId: row.pakasir_gateway_order_id
      ? String(row.pakasir_gateway_order_id)
      : null,
    googleAccountId:
      row.google_account_id === null ? null : Number(row.google_account_id),
    geminiPricePlanId:
      row.gemini_price_plan_id === null
        ? null
        : Number(row.gemini_price_plan_id),
    customerJid: String(row.customer_jid ?? ""),
    amount: Number(row.amount ?? 0),
    buyerCount: Math.max(1, Number(row.buyer_count ?? 1)),
    status: String(row.status ?? ""),
    orderStatus: row.order_status ? String(row.order_status) : null,
    commandName: row.nama_perintah
      ? String(row.nama_perintah)
      : row.google_account_email
        ? String(row.google_account_email)
        : null,
    googleAccountEmail: row.google_account_email
      ? String(row.google_account_email)
      : null,
    buyerEmail: row.buyer_email ? String(row.buyer_email) : null,
    stockContent: row.stock_content ? String(row.stock_content) : null,
    platform: String(row.platform ?? "whatsapp"),
    activeStatus: normalizeActiveStatus(row.active_status),
    memberStatus: String(row.member_status ?? "anggota"),
    reportStatus: normalizeReportStatus(row.report_status),
    proofDriveFileId: row.proof_drive_file_id
      ? String(row.proof_drive_file_id)
      : null,
    proofDriveUrl: row.proof_drive_url ? String(row.proof_drive_url) : null,
    proofUploadedAt: row.proof_uploaded_at
      ? String(row.proof_uploaded_at)
      : null,
    isManual: Boolean(Number(row.is_manual ?? 0)),
    activeDurationDays:
      row.active_duration_days === null
        ? null
        : Number(row.active_duration_days),
    warrantyDurationDays:
      row.warranty_duration_days === null
        ? null
        : Number(row.warranty_duration_days),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    activeStartAt: row.active_start_at ? String(row.active_start_at) : null,
    activeExpiresAt: row.active_expires_at
      ? String(row.active_expires_at)
      : null,
    warrantyStartAt: row.warranty_start_at
      ? String(row.warranty_start_at)
      : null,
    warrantyExpiresAt: row.warranty_expires_at
      ? String(row.warranty_expires_at)
      : null,
    warrantyStatus:
      String(row.warranty_status ?? "open") === "selesai" ? "selesai" : "open",
    warrantyClaimedAt: row.warranty_claimed_at
      ? String(row.warranty_claimed_at)
      : null,
    warrantyClaimStockId:
      row.warranty_claim_stock_id === null ||
      row.warranty_claim_stock_id === undefined
        ? null
        : Number(row.warranty_claim_stock_id),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}

function normalizeBuyerEmail(value) {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!email) return "";
  if (!/^[^\s@,;]+@gmail\.com$/i.test(email)) {
    throw new Error("Email buyer harus berakhiran @gmail.com");
  }
  return email;
}

function normalizeBuyerEmailList(value) {
  const emails = [
    ...new Set(
      String(value ?? "")
        .split(/[,;\n]+/)
        .map((item) => normalizeBuyerEmail(item))
        .filter(Boolean),
    ),
  ];
  return {
    buyerEmail: emails.join(","),
    buyerCount: Math.max(emails.length, 1),
  };
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

function formatTemplateDateId(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  return `${day}-${month}-${year}`;
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
  const activeStartAt =
    row.active_start_at ??
    row.activeStartAt ??
    row.completed_at ??
    row.completedAt ??
    null;
  const warrantyStartAt =
    row.warranty_start_at ??
    row.warrantyStartAt ??
    row.completed_at ??
    row.completedAt ??
    null;
  const activeExpiresAt = row.active_expires_at ?? row.activeExpiresAt ?? null;
  const warrantyExpiresAt =
    row.warranty_expires_at ?? row.warrantyExpiresAt ?? null;
  const completedAt =
    row.completed_at ??
    row.completedAt ??
    row.delivered_at ??
    row.deliveredAt ??
    null;
  const stockContent = String(
    row.stock_content ??
      row.stockContent ??
      row.data_akun ??
      row.dataAkun ??
      "",
  );
  const activeDurationDays = normalizeDurationDays(
    row.active_duration_days ?? row.activeDurationDays,
  );
  const warrantyDurationDays = normalizeDurationDays(
    row.warranty_duration_days ?? row.warrantyDurationDays,
  );
  const now = new Date();

  return {
    idTrx,
    idtrx: idTrx,
    orderId: idTrx,
    produk: String(row.nama_perintah ?? row.commandName ?? ""),
    produkgemini: "Gemini",
    produkcanva: "Canva",
    hargaproduk: inferTestimonialProduct(row),
    commandName: String(row.nama_perintah ?? row.commandName ?? ""),
    akunGoogle: String(
      row.google_account_email ?? row.googleAccountEmail ?? "",
    ),
    emailBuyer: String(row.buyer_email ?? row.buyerEmail ?? ""),
    nomorWa: String(row.customer_jid ?? row.customerJid ?? "").replace(
      "@s.whatsapp.net",
      "",
    ),
    customerJid: String(row.customer_jid ?? row.customerJid ?? ""),
    nominal: Number(row.amount ?? 0).toLocaleString("id-ID"),
    amount: String(row.amount ?? 0),
    platform: String(row.platform ?? "whatsapp"),
    payment: formatPaymentLabel(row.platform ?? "whatsapp"),
    paymentMethod: formatPaymentLabel(row.platform ?? "whatsapp"),
    status: String(row.status ?? ""),
    saluran: String(
      row.testimonial_channel_link ?? row.testimonialChannelLink ?? "",
    ),
    linkSaluran: String(
      row.testimonial_channel_link ?? row.testimonialChannelLink ?? "",
    ),
    jam: new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(now),
    tanggal: formatDateId(now),
    doneAt: formatDateId(completedAt, true),
    activeStart: formatTemplateDateId(activeStartAt),
    activeExp: formatTemplateDateId(activeExpiresAt),
    activeExpiresAt: formatTemplateDateId(activeExpiresAt),
    garansiStart: formatTemplateDateId(warrantyStartAt),
    garansiExp: formatTemplateDateId(warrantyExpiresAt),
    warrantyStart: formatTemplateDateId(warrantyStartAt),
    warrantyExp: formatTemplateDateId(warrantyExpiresAt),
    dataAkun: stockContent,
    data_akun: stockContent,
    stockContent,
    masaAktif: activeDurationDays ? `${activeDurationDays} Hari` : "-",
    masaGaransi: warrantyDurationDays ? `${warrantyDurationDays} Hari` : "-",
  };
}

function formatPlatformLabel(value) {
  const platform = String(value ?? "")
    .trim()
    .toLowerCase();
  if (platform === "whatsapp") return "WhatsApp";
  if (platform === "shopee") return "Shopee";
  if (platform === "pribadi") return "Pribadi";
  return platform || "-";
}

function formatPaymentLabel(value) {
  const platform = String(value ?? "")
    .trim()
    .toLowerCase();
  if (platform === "whatsapp") return "QRIS";
  if (platform === "shopee") return "ShopeePay";
  return "-";
}

function formatShortDateId(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  return `${day}-${month}-${year}`;
}

function formatTestimonialPrice(value) {
  return Number(value ?? 0).toLocaleString("id-ID");
}

function calculateInclusiveDays(startValue, endValue) {
  if (!startValue || !endValue) return null;
  const start = startValue instanceof Date ? startValue : new Date(startValue);
  const end = endValue instanceof Date ? endValue : new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
  );
}

function formatTestimonialActiveDuration(transaction) {
  const days =
    normalizeDurationDays(
      transaction.active_duration_days ?? transaction.activeDurationDays,
    ) ??
    calculateInclusiveDays(
      transaction.active_start_at ?? transaction.activeStartAt,
      transaction.active_expires_at ?? transaction.activeExpiresAt,
    );
  return days ? `${days} Day` : "-";
}

function inferTestimonialProduct(transaction) {
  const commandName = String(
    transaction.nama_perintah ?? transaction.commandName ?? "",
  ).trim();
  const planLabel = String(
    transaction.gemini_price_plan_label ??
      transaction.geminiPricePlanLabel ??
      "",
  ).trim();
  const source = `${commandName} ${planLabel}`.trim();
  const lowered = source.toLowerCase();

  if (lowered.includes("canva")) return "Canva";
  if (
    lowered.includes("gemini") ||
    transaction.gemini_price_plan_id ||
    transaction.geminiPricePlanId
  ) {
    return "Gemini";
  }

  return commandName.replace(/^\/+/, "") || planLabel || "-";
}

function buildTestimonialMessage(transaction) {
  return (
    `Transaksi Berhasil\n` +
    `==========================\n\n` +
    `Rincian Produk` +
    "```\n" +
    `idTrx       : ${transaction.pakasir_order_id ?? transaction.idTrx ?? "-"}\n` +
    `Harga       : ${formatTestimonialPrice(transaction.amount)}\n` +
    `Produk      : ${inferTestimonialProduct(transaction)}\n` +
    `Platform    : ${formatPlatformLabel(transaction.platform)}\n` +
    `Payment     : ${formatPaymentLabel(transaction.platform)}\n` +
    `Masa aktif  : ${formatTestimonialActiveDuration(transaction)}\n` +
    `Start       : ${formatShortDateId(transaction.active_start_at ?? transaction.activeStartAt)}\n` +
    `Expired     : ${formatShortDateId(transaction.active_expires_at ?? transaction.activeExpiresAt)}\n` +
    "```\n" +
    `==========================\n` +
    `Terima Kasih Sudah Order\n` +
    `🔥 WISNU STORE 🔥\n` +
    `Semoga Jadi Langganan\n` +
    `==========================`
  );
}

function withLifecycleDates(transaction, lifecycle) {
  return {
    ...transaction,
    completed_at: transaction.completed_at ?? lifecycle.completedAt,
    active_start_at: transaction.active_start_at ?? lifecycle.activeStartAt,
    active_expires_at:
      transaction.active_expires_at ?? lifecycle.activeExpiresAt,
    warranty_start_at:
      transaction.warranty_start_at ?? lifecycle.warrantyStartAt,
    warranty_expires_at:
      transaction.warranty_expires_at ?? lifecycle.warrantyExpiresAt,
  };
}

async function sendTransactionTestimonial(sock, transaction, options = {}) {
  const force = Boolean(options.force);
  if (!sock || !transaction || (!force && transaction.testimonial_sent_at)) {
    return false;
  }

  const channelJid = String(transaction.testimonial_channel_jid ?? "").trim();
  if (!channelJid) {
    return false;
  }

  const pool = getPool();
  const [currentRows] = await pool.execute(
    "SELECT testimonial_sent_at, report_status, platform FROM cs_transactions WHERE id = ? LIMIT 1",
    [Number(transaction.id)],
  );
  const current = currentRows[0] ?? {};
  if (
    isPrivateTestimonialPlatform(current.platform ?? transaction.platform) ||
    !isReportReadyForTestimonial(
      current.report_status ?? transaction.report_status ?? transaction.reportStatus,
    )
  ) {
    return false;
  }
  if (!force && current.testimonial_sent_at) {
    return false;
  }

  try {
    if (typeof sock.newsletterMetadata === "function") {
      const metadata = await sock.newsletterMetadata(
        "jid",
        channelJid,
        "ADMIN",
      );
      const role = getNewsletterViewerRole(metadata);
      if (role && !isNewsletterAdminRole(role)) {
        await pool.execute(
          "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
          [
            Number(transaction.user_id),
            "testimonial_channel_not_admin",
            "Bot belum jadi admin saluran testimoni. Jadikan bot sebagai admin saluran agar testimoni transaksi bisa terkirim.",
          ],
        );
        return false;
      }
    }

    await sock.sendMessage(channelJid, {
      text: buildTestimonialMessage(transaction),
    });
    if (force) {
      await pool.execute(
        "UPDATE cs_transactions SET testimonial_sent_at = CURRENT_TIMESTAMP WHERE id = ?",
        [Number(transaction.id)],
      );
    } else {
      await pool.execute(
        "UPDATE cs_transactions SET testimonial_sent_at = CURRENT_TIMESTAMP WHERE id = ? AND testimonial_sent_at IS NULL",
        [Number(transaction.id)],
      );
    }
    return true;
  } catch (err) {
    logger.warn(
      err,
      `Testimonial channel send failed for ${transaction.pakasir_order_id}`,
    );
    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [
        Number(transaction.user_id),
        "testimonial_channel_failed",
        `Gagal mengirim testimoni ${transaction.pakasir_order_id}. Pastikan bot sudah masuk saluran dan menjadi admin.`,
      ],
    );
    return false;
  }
}

function applyTemplate(text, row) {
  const source = String(text ?? "");
  if (!source) return "";
  const data = buildTemplateData(row);
  const rendered = source.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\{\s*([a-zA-Z0-9_]+)\s*\}/g,
    (_match, a, b) => {
      const key = a || b;
      return data[key] ?? data[key?.toLowerCase?.()] ?? "";
    },
  );
  if (
    String(row?.platform ?? "")
      .trim()
      .toLowerCase() === "whatsapp"
  ) {
    return rendered
      .split(/\r?\n/)
      .filter((line) => !/^Platform\s*:\s*whatsapp\s*$/i.test(line.trim()))
      .join("\n");
  }
  return rendered;
}

async function findTestimonialTransactionForUser(userId, idTrx) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT tx.id, tx.user_id, tx.cs_id, tx.customer_jid, tx.pakasir_order_id,
            tx.amount, tx.status, tx.platform, tx.gemini_price_plan_id,
            tx.active_duration_days,
            tx.completed_at, tx.active_start_at, tx.active_expires_at,
            tx.warranty_start_at, tx.warranty_expires_at,
            tx.report_status, tx.testimonial_sent_at, cs.nama_perintah,
            gp.label AS gemini_price_plan_label,
            s.testimonial_channel_jid, s.testimonial_channel_name
       FROM cs_transactions tx
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN gemini_price_plans gp ON gp.id = tx.gemini_price_plan_id
       LEFT JOIN app_settings s ON s.user_id = tx.user_id
      WHERE tx.user_id = ?
        AND UPPER(tx.pakasir_order_id) = UPPER(?)
      LIMIT 1`,
    [Number(userId), String(idTrx)],
  );
  return rows[0] ?? null;
}

async function sendTransactionTestimonialForUser({
  user,
  idTrx,
  sock,
  force = false,
}) {
  const trxId = String(idTrx ?? "").trim();
  if (!trxId) {
    throw new Error("idTrx wajib diisi");
  }

  const transaction = await findTestimonialTransactionForUser(user.id, trxId);
  if (!transaction) {
    throw new Error(`Transaksi tidak ditemukan: ${trxId}`);
  }

  const message = buildTestimonialMessage(transaction);
  const status = String(transaction.status ?? "")
    .trim()
    .toLowerCase();
  const reportStatus = normalizeReportStatus(transaction.report_status);
  if (!PAID_STATUSES.has(status)) {
    return {
      sent: false,
      reason: `Transaksi belum sukses. Status: ${status || "-"}`,
      preview: message,
      idTrx: String(transaction.pakasir_order_id ?? trxId),
    };
  }
  if (isPrivateTestimonialPlatform(transaction.platform)) {
    return {
      sent: false,
      reason: "Platform pribadi tidak dikirim ke saluran testimoni.",
      preview: message,
      idTrx: String(transaction.pakasir_order_id ?? trxId),
    };
  }
  if (!isReportReadyForTestimonial(reportStatus)) {
    return {
      sent: false,
      reason: `Status laporan masih ${reportStatus}. Testimoni dikirim setelah laporan selesai.`,
      preview: message,
      idTrx: String(transaction.pakasir_order_id ?? trxId),
    };
  }
  if (!force && transaction.testimonial_sent_at) {
    return {
      sent: false,
      reason: "Testimoni transaksi ini sudah pernah dikirim.",
      preview: message,
      idTrx: String(transaction.pakasir_order_id ?? trxId),
    };
  }
  if (!String(transaction.testimonial_channel_jid ?? "").trim()) {
    return {
      sent: false,
      reason: "Saluran testimoni belum diatur atau belum terhubung.",
      preview: message,
      idTrx: String(transaction.pakasir_order_id ?? trxId),
    };
  }
  if (!sock) {
    return {
      sent: false,
      reason: "Bot utama belum online.",
      preview: message,
      idTrx: String(transaction.pakasir_order_id ?? trxId),
    };
  }

  const sent = await sendTransactionTestimonial(sock, transaction, { force });
  return {
    sent,
    reason: sent ? null : "Gagal mengirim testimoni ke saluran.",
    preview: message,
    idTrx: String(transaction.pakasir_order_id ?? trxId),
  };
}

function renderPaymentSuccessText(transaction, fallback, stockContent = "") {
  const template = String(transaction?.payment_success_text ?? "").trim();
  return applyTemplate(template || fallback, {
    ...transaction,
    stock_content: stockContent,
    stockContent,
    dataAkun: stockContent,
  });
}

function getTransactionMessageTemplateForPlatform(value, platform) {
  const raw = String(value ?? "").trim();
  const key =
    String(platform ?? "")
      .trim()
      .toLowerCase() === "whatsapp"
      ? "whatsapp"
      : "shopee";
  if (!raw)
    return key === "whatsapp"
      ? DEFAULT_WHATSAPP_TRANSACTION_MESSAGE_TEMPLATE
      : DEFAULT_TRANSACTION_MESSAGE_TEMPLATE;
  try {
    const parsed = JSON.parse(raw);
    return (
      String(parsed?.[key] ?? "").trim() ||
      (key === "whatsapp"
        ? DEFAULT_WHATSAPP_TRANSACTION_MESSAGE_TEMPLATE
        : DEFAULT_TRANSACTION_MESSAGE_TEMPLATE)
    );
  } catch {
    return raw;
  }
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

  const idTrx = String(
    row.pakasir_order_id ??
      row.idTrx ??
      row.id_trx ??
      row.orderId ??
      row.order_id ??
      "",
  );
  const createdAt = row.created_at ?? row.createdAt ?? null;
  const createdMs = createdAt ? new Date(createdAt).getTime() : NaN;
  const expiresAt = Number.isNaN(createdMs)
    ? null
    : new Date(createdMs + PAYMENT_EXPIRY_MS).toISOString();
  return {
    idTrx,
    orderId: idTrx,
    paymentGatewayOrderId: row.pakasir_gateway_order_id
      ? String(row.pakasir_gateway_order_id)
      : null,
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
      orderId:
        transaction.pakasir_gateway_order_id || transaction.pakasir_order_id,
      amount: transaction.amount,
    });
  } catch (err) {
    logger.warn(
      err,
      `Pakasir cancel failed for ${transaction.pakasir_order_id}`,
    );
  }

  await pool.execute(
    "UPDATE cs_transactions SET status = ? WHERE id = ? AND status = 'pending'",
    [status, Number(transaction.id)],
  );
  return true;
}

function schedulePendingExpiry(transaction) {
  const createdAt =
    transaction?.created_at ?? transaction?.createdAt ?? Date.now();
  const createdMs = new Date(createdAt).getTime();
  const delayMs = Math.max(
    0,
    (Number.isNaN(createdMs) ? Date.now() : createdMs) +
      PAYMENT_EXPIRY_MS -
      Date.now(),
  );

  const timer = setTimeout(() => {
    closePendingTransaction(transaction, "expired").catch((err) => {
      logger.warn(
        err,
        `Failed to expire transaction ${transaction?.pakasir_order_id ?? "-"}`,
      );
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
            tx.pakasir_gateway_order_id,
            tx.pakasir_payment_url, tx.qris_string, tx.amount, tx.status, tx.created_at,
            tx.platform, tx.active_duration_days, tx.warranty_duration_days,
            cs.nama_perintah,
            s.pakasir_slug, s.pakasir_api_key,
            s.testimonial_channel_jid, s.testimonial_channel_name,
            tx.testimonial_sent_at
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
  const pendingRows = await findPendingTransactionsForCustomer(
    userId,
    customerJid,
  );
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

async function createBuyTransaction({
  userId,
  csId,
  buttonId = null,
  customerJid,
}) {
  const entry = await getEntryForUser(userId, csId, buttonId);
  if (!entry) {
    throw new Error("Produk customer service tidak ditemukan");
  }

  if (String(entry.delivery_mode ?? "none") === "stock") {
    const availableStock = await csStockService.countAvailableForCs(entry.id);
    if (availableStock <= 0) {
      return {
        stockUnavailable: true,
        csId: Number(entry.id),
        commandName: String(entry.nama_perintah ?? ""),
        message:
          "Stock lagi kosong. Klik button di bawah ini untuk mengingatkan owner agar segera restock.",
      };
    }
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

  const orderId = await generateWhatsappManualIdTrx(userId);
  const gatewayOrderId = buildPakasirGatewayOrderId(csId);
  const pakasirPayment = await createPakasirQrisPayment({
    slug: settings.pakasirSlug,
    apiKey: settings.pakasirApiKey,
    orderId: gatewayOrderId,
    amount: price,
  });
  const adminFee = Number.isFinite(Number(pakasirPayment.fee))
    ? Number(pakasirPayment.fee)
    : calculateQrisAdminFee(price);
  const totalPayment = Number.isFinite(Number(pakasirPayment.total_payment))
    ? Number(pakasirPayment.total_payment)
    : price + adminFee;
  const paymentUrl = buildPaymentUrl(
    settings.pakasirSlug,
    price,
    gatewayOrderId,
  );

  const pool = getPool();
  const [insertResult] = await pool.execute(
    `INSERT INTO cs_transactions
       (user_id, cs_id, customer_jid, pakasir_order_id, pakasir_payment_url,
         qris_string, amount, platform, active_duration_days, warranty_duration_days,
         pakasir_gateway_order_id, report_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      gatewayOrderId,
      "selesai",
    ],
  );
  if (insertResult.insertId) {
    schedulePendingExpiry({
      id: insertResult.insertId,
      user_id: Number(userId),
      customer_jid: String(customerJid),
      pakasir_order_id: orderId,
      pakasir_gateway_order_id: gatewayOrderId,
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
    paymentGatewayOrderId: gatewayOrderId,
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

  const orderId = await generateWhatsappManualIdTrx(userId);
  const completedAt = new Date();
  const lifecycle = buildLifecyclePatch(
    completedAt,
    entry.active_duration_days,
    entry.warranty_duration_days,
  );
  const targetJid = normalizeJid(customerJid) || String(ownerJid);
  const normalizedPlatform = normalizePlatform(platform);
  const reportStatus = normalizeReportStatusForPlatform(normalizedPlatform);

  const pool = getPool();
  const settings = await appSettingsService.getRawForUserId(userId);
  const [insertResult] = await pool.execute(
    `INSERT INTO cs_transactions
       (user_id, cs_id, customer_jid, pakasir_order_id, pakasir_payment_url,
        qris_string, amount, status, paid_at, delivered_at, platform, report_status, is_manual,
        active_duration_days, warranty_duration_days, completed_at, active_start_at,
        active_expires_at, warranty_start_at, warranty_expires_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, 'paid', ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(userId),
      Number(csId),
      targetJid,
      orderId,
      price,
      completedAt,
      completedAt,
      normalizedPlatform,
      reportStatus,
      normalizeDurationDays(entry.active_duration_days),
      normalizeDurationDays(entry.warranty_duration_days),
      lifecycle.completedAt,
      lifecycle.activeStartAt,
      lifecycle.activeExpiresAt,
      lifecycle.warrantyStartAt,
      lifecycle.warrantyExpiresAt,
    ],
  );
  realtimeService.emitTrxGeminiChanged(userId, {
    source: "owner_manual_transaction_create",
  });

  return {
    id: Number(insertResult.insertId ?? 0),
    user_id: Number(userId),
    customer_jid: targetJid,
    pakasir_order_id: orderId,
    nama_perintah: String(entry.nama_perintah ?? ""),
    testimonial_channel_jid: settings.testimonialChannelJid || "",
    testimonial_sent_at: null,
    idTrx: orderId,
    orderId,
    amount: price,
    price,
    platform: normalizedPlatform,
    report_status: reportStatus,
    reportStatus,
    commandName: String(entry.nama_perintah ?? ""),
    activeExpiresAt: lifecycle.activeExpiresAt
      ? lifecycle.activeExpiresAt.toISOString()
      : null,
    warrantyExpiresAt: lifecycle.warrantyExpiresAt
      ? lifecycle.warrantyExpiresAt.toISOString()
      : null,
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
            tx.pakasir_gateway_order_id,
            tx.pakasir_payment_url, tx.qris_string, tx.amount, tx.status, tx.stock_id, tx.delivered_at, tx.created_at,
            tx.platform, tx.report_status, tx.active_duration_days, tx.warranty_duration_days,
            tx.completed_at, tx.active_start_at, tx.active_expires_at,
            tx.warranty_start_at, tx.warranty_expires_at,
            cs.nama_perintah, cs.delivery_mode, cs.relay_prompt, cs.payment_success_text,
            cs.relay_waiting_text, cs.relay_owner_instruction, cs.relay_done_text,
            s.pakasir_slug, s.pakasir_api_key,
            s.testimonial_channel_jid, s.testimonial_channel_name,
            tx.testimonial_sent_at
       FROM cs_transactions tx
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN app_settings s ON s.user_id = tx.user_id
      WHERE (tx.pakasir_gateway_order_id = ? OR tx.pakasir_order_id = ?)
        AND tx.amount = ?
      LIMIT 1`,
    [String(orderId), String(orderId), Number(amount)],
  );
  return rows[0] ?? null;
}

async function findTransactionByOrderForUser(userId, orderId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT tx.id, tx.user_id, tx.cs_id, tx.customer_jid, tx.pakasir_order_id,
            tx.pakasir_gateway_order_id,
            tx.pakasir_payment_url, tx.qris_string, tx.amount, tx.status, tx.stock_id, tx.delivered_at, tx.created_at,
            tx.platform, tx.report_status, tx.active_duration_days, tx.warranty_duration_days,
            tx.completed_at, tx.active_start_at, tx.active_expires_at,
            tx.warranty_start_at, tx.warranty_expires_at,
            cs.nama_perintah, cs.delivery_mode, cs.relay_prompt, cs.payment_success_text,
            s.pakasir_slug, s.pakasir_api_key,
            s.testimonial_channel_jid, s.testimonial_channel_name,
            tx.testimonial_sent_at
       FROM cs_transactions tx
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN app_settings s ON s.user_id = tx.user_id
      WHERE tx.user_id = ?
        AND (UPPER(tx.pakasir_order_id) = UPPER(?) OR UPPER(tx.pakasir_gateway_order_id) = UPPER(?))
      LIMIT 1`,
    [Number(userId), String(orderId), String(orderId)],
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
  realtimeService.emitTrxGeminiChanged(tx.user_id, {
    source: "transaction_paid",
  });

  return {
    paid: true,
    transaction: { ...tx, status: "paid" },
    reason: null,
  };
}

async function checkAndDeliverPayment({
  userId,
  idTrx,
  orderId,
  customerJid,
  sock,
}) {
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
        tx.relay_prompt || "Pembayaran berhasil. Pesanan kamu sudah diproses.",
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
    orderId: tx.pakasir_gateway_order_id || tx.pakasir_order_id,
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
  realtimeService.emitTrxGeminiChanged(userId, {
    source: "transaction_paid_check",
  });

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
      message:
        tx.status === "expired"
          ? "Transaksi sudah expired."
          : "Transaksi sudah dibatalkan.",
      transaction: buildPaymentView(tx),
    };
  }

  await closePendingTransaction(
    tx,
    isPaymentExpired(tx) ? "expired" : "failed",
  );
  return {
    cancelled: true,
    paid: false,
    message: isPaymentExpired(tx)
      ? "Transaksi sudah expired dan dibatalkan."
      : "Transaksi berhasil dibatalkan. Kamu bisa membuat transaksi baru.",
    transaction: buildPaymentView(tx),
  };
}

async function claimWarrantyForCustomer({ userId, idTrx, customerJid }) {
  const trxId = String(idTrx ?? "").trim();
  if (!trxId) {
    return {
      claimed: false,
      message: "Format claim garansi: /claimgaransi TRX-12",
    };
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT tx.id, tx.user_id, tx.cs_id, tx.customer_jid, tx.pakasir_order_id,
              tx.status, tx.warranty_expires_at, tx.warranty_status,
              cs.nama_perintah
         FROM cs_transactions tx
         LEFT JOIN customer_service cs ON cs.id = tx.cs_id
        WHERE tx.user_id = ?
          AND UPPER(tx.pakasir_order_id) = UPPER(?)
        LIMIT 1
        FOR UPDATE OF tx`,
      [Number(userId), trxId],
    );

    const tx = rows[0];
    if (!tx) {
      await conn.rollback();
      return { claimed: false, message: "idTRX tidak ditemukan." };
    }

    if (customerJid && String(tx.customer_jid) !== String(customerJid)) {
      await conn.rollback();
      return {
        claimed: false,
        message: "Transaksi ini bukan milik nomor kamu.",
      };
    }

    if (String(tx.status) !== "paid") {
      await conn.rollback();
      return {
        claimed: false,
        message: "Garansi hanya bisa diklaim setelah transaksi sukses.",
      };
    }

    if (String(tx.warranty_status ?? "open") === "selesai") {
      await conn.rollback();
      return {
        claimed: false,
        message: `Garansi ${tx.pakasir_order_id} sudah selesai atau sudah pernah diklaim.`,
      };
    }

    if (!tx.warranty_expires_at) {
      await conn.rollback();
      return {
        claimed: false,
        message: "Transaksi ini tidak memiliki masa garansi.",
      };
    }

    const warrantyExpiresAt = new Date(tx.warranty_expires_at);
    if (
      Number.isNaN(warrantyExpiresAt.getTime()) ||
      warrantyExpiresAt.getTime() < Date.now()
    ) {
      await conn.rollback();
      return {
        claimed: false,
        message: `Masa claim garansi sudah lewat. Exp garansi: ${formatDateId(tx.warranty_expires_at)}.`,
      };
    }

    if (!tx.cs_id) {
      await conn.rollback();
      return {
        claimed: false,
        message: "Produk transaksi tidak ditemukan untuk claim garansi.",
      };
    }

    const [stockRows] = await conn.execute(
      `SELECT id, content
         FROM cs_stocks
        WHERE cs_id = ? AND is_used = 0
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE`,
      [Number(tx.cs_id)],
    );

    const stock = stockRows[0];
    if (!stock) {
      await conn.rollback();
      return {
        claimed: false,
        message: "Stock produk habis, silakan hubungi owner.",
      };
    }

    await conn.execute(`DELETE FROM cs_stocks WHERE id = ? AND is_used = 0`, [
      Number(stock.id),
    ]);
    await conn.execute(
      `UPDATE cs_transactions
          SET warranty_status = 'selesai',
              warranty_claimed_at = CURRENT_TIMESTAMP,
              warranty_claim_stock_id = NULL
        WHERE id = ?`,
      [Number(tx.id)],
    );

    await conn.commit();
    realtimeService.emitTrxGeminiChanged(userId, { source: "warranty_claim" });
    return {
      claimed: true,
      stockContent: String(stock.content ?? ""),
      message:
        `Claim garansi berhasil.\n\n` +
        `idTRX: ${tx.pakasir_order_id}\n` +
        `Produk: ${tx.nama_perintah || "-"}\n\n` +
        `Data garansi:\n${String(stock.content ?? "")}`,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function deliverPaidTransaction(sock, transaction) {
  if (!sock || !transaction) {
    return false;
  }

  const deliveryLifecycle = buildLifecyclePatch(
    new Date(),
    transaction.active_duration_days,
    transaction.warranty_duration_days,
  );

  if (transaction.delivered_at) {
    await sendTransactionTestimonial(
      sock,
      withLifecycleDates(transaction, deliveryLifecycle),
    );
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
          SET stock_id = NULL, delivered_at = CURRENT_TIMESTAMP,
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
      renderPaymentSuccessText(
        transaction,
        `Pembayaran berhasil.\n\nData pesanan kamu:\n${stock.content}`,
        stock.content,
      ),
    );
    await sendTransactionTestimonial(
      sock,
      withLifecycleDates(transaction, deliveryLifecycle),
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
      renderPaymentSuccessText(transaction, prompt),
    );
    await sendTransactionTestimonial(sock, transaction);
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
    renderPaymentSuccessText(
      transaction,
      "Pembayaran berhasil. Pesanan kamu sedang diproses.",
    ),
  );
  await sendTransactionTestimonial(
    sock,
    withLifecycleDates(transaction, deliveryLifecycle),
  );
  return true;
}

async function sendPaymentSuccessMessage(sock, messageKey, jid, text) {
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
            COALESCE(s.bot_info_phone_number, b.owner_phone_number, b.phone_number) AS owner_phone_number
       FROM cs_relay_sessions rs
       JOIN cs_transactions tx ON tx.id = rs.transaction_id
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN app_settings s ON s.user_id = tx.user_id
       LEFT JOIN bots b ON b.id = (
         SELECT id
           FROM bots
          WHERE user_id = tx.user_id
            AND is_online = 1
            AND COALESCE(bot_purpose, 'main') = 'main'
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
  const ownerMessage = applyTemplate(
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
            COALESCE(s.bot_info_phone_number, b.owner_phone_number, b.phone_number) AS owner_phone_number
       FROM cs_relay_sessions rs
       JOIN cs_transactions tx ON tx.id = rs.transaction_id
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN app_settings s ON s.user_id = tx.user_id
       LEFT JOIN bots b ON b.id = (
         SELECT id
           FROM bots
          WHERE user_id = tx.user_id
            AND is_online = 1
            AND COALESCE(bot_purpose, 'main') = 'main'
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
    `SELECT tx.id, tx.pakasir_order_id, tx.pakasir_gateway_order_id, tx.customer_jid, tx.google_account_id,
            tx.gemini_price_plan_id, tx.amount, tx.buyer_count,
            tx.status, tx.order_status, tx.paid_at, tx.delivered_at, tx.created_at,
            tx.platform, tx.active_status, tx.member_status, tx.is_manual, tx.active_duration_days, tx.warranty_duration_days,
            tx.completed_at, tx.active_start_at, tx.active_expires_at,
            tx.warranty_start_at, tx.warranty_expires_at, tx.warranty_status,
            tx.warranty_claimed_at, tx.warranty_claim_stock_id, tx.buyer_email,
            tx.report_status, tx.proof_drive_file_id, tx.proof_drive_url, tx.proof_uploaded_at,
            cs.nama_perintah, st.content AS stock_content,
            ga.email AS google_account_email
       FROM cs_transactions tx
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
       LEFT JOIN cs_stocks st ON st.id = tx.stock_id
       LEFT JOIN google_accounts ga ON ga.id = tx.google_account_id
      WHERE tx.user_id = ?
        AND tx.status = 'paid'
      ORDER BY COALESCE(tx.paid_at, tx.created_at) DESC`,
    [Number(user.id)],
  );

  return rows.map(mapPaidTransactionRow);
}

function parseManualStartDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00+07:00`);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseManualNullableDate(value) {
  const parsed = nullableDate(value);
  if (!parsed) return null;
  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function generateWhatsappManualIdTrx(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT pakasir_order_id FROM cs_transactions WHERE user_id = ? AND pakasir_order_id LIKE 'TRX-%'",
    [Number(userId)],
  );
  const maxNumber = rows.reduce((max, row) => {
    const match = String(row.pakasir_order_id ?? "").match(/^TRX-(\d+)$/i);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
  return `TRX-${maxNumber + 1}`;
}

async function createManualTransactionForUser(user, payload) {
  const googleAccountId = Number(
    payload.googleAccountId ?? payload.google_account_id ?? 0,
  );
  const pricePlanId = Number(
    payload.pricePlanId ??
      payload.geminiPricePlanId ??
      payload.gemini_price_plan_id ??
      0,
  );
  const platform = normalizePlatform(payload.platform || "shopee");
  const idTrx =
    platform === "whatsapp"
      ? await generateWhatsappManualIdTrx(user.id)
      : String(
          payload.idTrx ?? payload.noPesanan ?? payload.no_pesanan ?? "",
        ).trim();
  const { buyerEmail, buyerCount } = normalizeBuyerEmailList(
    payload.buyerEmail ?? payload.email ?? payload.buyer_email,
  );
  const customerJid =
    normalizeCustomerJid(
      payload.phoneNumber ??
        payload.phone_number ??
        payload.noHp ??
        payload.no_hp ??
        payload.waNumber ??
        payload.wa_number ??
        payload.customerJid ??
        payload.customer_jid,
    ) || buyerEmail;
  const pricePlan = pricePlanId
    ? await geminiPriceService.getActiveForUser(user.id, pricePlanId)
    : null;
  if (pricePlanId && !pricePlan) {
    throw new Error("Paket harga tidak ditemukan atau non aktif");
  }
  const activeDurationDays = pricePlan
    ? normalizeDurationDays(pricePlan.durationDays)
    : (normalizeDurationDays(
        payload.activeDurationDays ?? payload.masaAktif ?? 30,
      ) ?? 30);
  const payloadAmount = Number(payload.amount);
  const amount =
    Number.isFinite(payloadAmount) && payloadAmount >= 0
      ? Math.floor(payloadAmount)
      : pricePlan
        ? Number(pricePlan.price) * buyerCount
        : 0;
  const warrantyDurationDays = Math.max(1, Math.floor(activeDurationDays / 2));
  const startAt = parseManualStartDate(
    payload.startDate ?? payload.start ?? payload.activeStartAt,
  );
  const lifecycle = buildLifecyclePatch(
    startAt,
    activeDurationDays,
    warrantyDurationDays,
  );
  const activeStartAt =
    parseManualNullableDate(payload.activeStartAt ?? payload.active_start_at) ??
    lifecycle.activeStartAt;
  const activeExpiresAt =
    parseManualNullableDate(
      payload.activeExpiresAt ?? payload.active_expires_at,
    ) ?? lifecycle.activeExpiresAt;
  const warrantyStartAt =
    parseManualNullableDate(
      payload.warrantyStartAt ?? payload.warranty_start_at,
    ) ?? lifecycle.warrantyStartAt;
  const warrantyExpiresAt =
    parseManualNullableDate(
      payload.warrantyExpiresAt ?? payload.warranty_expires_at,
    ) ?? lifecycle.warrantyExpiresAt;
  const activeStatus = normalizeActiveStatus(
    payload.activeStatus ?? payload.active_status,
  );
  const memberStatus =
    String(payload.memberStatus ?? payload.member_status ?? "anggota")
      .trim()
      .toLowerCase() === "kick"
      ? "kick"
      : "anggota";
  const orderStatus = normalizeOrderStatus(
    payload.orderStatus ?? payload.order_status ?? payload.statusText,
  );
  const reportStatus = normalizeReportStatusForPlatform(
    platform,
    payload.reportStatus ?? payload.report_status,
  );
  const now = new Date();

  if (!googleAccountId) throw new Error("Akun Google wajib dipilih");
  if (!pricePlanId) throw new Error("Paket harga wajib dipilih");
  if (!idTrx)
    throw new Error(
      platform === "shopee"
        ? "ID pesanan Shopee wajib diisi"
        : "No pesanan wajib diisi",
    );
  if (!buyerEmail) throw new Error("Email buyer wajib diisi");
  if (!isValidManualPlatform(platform)) {
    throw new Error("Platform tidak valid");
  }

  const pool = getPool();
  const [existingTransactions] = await pool.execute(
    "SELECT id FROM cs_transactions WHERE pakasir_order_id = ? LIMIT 1",
    [idTrx],
  );
  if (existingTransactions.length > 0) {
    throw new Error(`No pesanan sudah ada: ${idTrx}`);
  }

  const [accounts] = await pool.execute(
    "SELECT id, email FROM google_accounts WHERE id = ? AND user_id = ? LIMIT 1",
    [googleAccountId, Number(user.id)],
  );
  if (accounts.length === 0) {
    throw new Error("Akun Google tidak ditemukan");
  }

  let proofUpload = null;
  if (payload.proofImage?.buffer) {
    const settings = await appSettingsService.getRawForUserId(user.id);
    const originalName = String(
      payload.proofImage.originalname ?? "bukti-transaksi.jpg",
    );
    const extension = originalName.includes(".")
      ? originalName.split(".").pop()
      : "jpg";
    proofUpload = await googleDriveService.uploadImage({
      oauthClientId: settings.googleDriveClientId,
      oauthClientSecret: settings.googleDriveClientSecret,
      oauthRefreshToken: settings.googleDriveRefreshToken,
      folderId: settings.googleDriveFolderId,
      buffer: payload.proofImage.buffer,
      mimeType: String(payload.proofImage.mimetype ?? "image/jpeg"),
      filename: `${idTrx}.${extension}`,
    });
  }

  const [insertResult] = await pool.execute(
    `INSERT INTO cs_transactions
       (user_id, cs_id, google_account_id, gemini_price_plan_id, customer_jid, buyer_email,
       buyer_count, pakasir_order_id, pakasir_payment_url, qris_string, amount, status, order_status,
        paid_at, delivered_at, platform, active_status, member_status, is_manual, active_duration_days,
        warranty_duration_days, completed_at, active_start_at, active_expires_at,
        warranty_start_at, warranty_expires_at, report_status, proof_drive_file_id, proof_drive_url, proof_uploaded_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'paid', ?, ?, NULL, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(user.id),
      googleAccountId,
      pricePlanId,
      customerJid,
      buyerEmail,
      buyerCount,
      idTrx,
      amount,
      orderStatus,
      now,
      platform,
      activeStatus,
      memberStatus,
      activeDurationDays,
      warrantyDurationDays,
      lifecycle.completedAt,
      activeStartAt,
      activeExpiresAt,
      warrantyStartAt,
      warrantyExpiresAt,
      reportStatus,
      proofUpload?.fileId ?? null,
      proofUpload?.url ?? null,
      proofUpload ? now : null,
    ],
  );

  const [rows] = await pool.execute(
    `SELECT tx.id, tx.pakasir_order_id, tx.pakasir_gateway_order_id, tx.customer_jid, tx.google_account_id,
            tx.gemini_price_plan_id, tx.buyer_email, tx.buyer_count,
            tx.amount, tx.status, tx.order_status, tx.platform, tx.active_status, tx.member_status, tx.is_manual,
            tx.active_duration_days, tx.warranty_duration_days,
            tx.completed_at, tx.active_start_at, tx.active_expires_at,
            tx.warranty_start_at, tx.warranty_expires_at,
            tx.report_status, tx.proof_drive_file_id, tx.proof_drive_url, tx.proof_uploaded_at,
            tx.paid_at, tx.delivered_at, tx.created_at,
            ga.email AS google_account_email
       FROM cs_transactions tx
       LEFT JOIN google_accounts ga ON ga.id = tx.google_account_id
      WHERE tx.id = ? AND tx.user_id = ?
      LIMIT 1`,
    [Number(insertResult.insertId ?? 0), Number(user.id)],
  );

  return mapPaidTransactionRow({ ...rows[0], stock_content: null });
}

async function sendManualTransactionTemplate({
  user,
  transaction,
  sock,
  targetPhone,
}) {
  const targetJid =
    normalizeCustomerJid(targetPhone) ||
    normalizeCustomerJid(transaction?.customerJid);
  if (!targetJid) {
    return { sent: false, reason: "Nomor WA kosong" };
  }
  if (!sock) {
    return { sent: false, reason: "Bot utama belum online" };
  }

  const settings = await appSettingsService.getForUser(user);
  const template = getTransactionMessageTemplateForPlatform(
    settings.transactionMessageTemplate,
    transaction.platform,
  );
  const text = applyTemplate(template, {
    ...transaction,
    testimonialChannelLink: settings.testimonialChannelLink,
  });
  const sent = await messageService.sendCustomerServiceMessage(
    sock,
    null,
    targetJid,
    text,
  );
  return {
    sent,
    reason: sent ? null : "Gagal mengirim template ke nomor WA",
  };
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0") && digits.length > 1)
    return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

function normalizeCustomerJid(value) {
  const raw = String(value ?? "").trim();
  if (raw.includes("@")) return raw;
  const phone = normalizePhone(raw);
  return phone ? `${phone}@s.whatsapp.net` : "";
}

function nullableDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00+07:00`,
    ).toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00+07:00`).toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

async function updateTransactionForUser(user, transactionId, payload) {
  if (
    String(payload.mode ?? payload.type ?? "")
      .trim()
      .toLowerCase() === "bot_wa"
  ) {
    return updateBotWaTransactionForUser(user, transactionId, payload);
  }

  const idTrx = String(payload.idTrx ?? payload.id_trx ?? "").trim();
  const googleAccountId = Number(
    payload.googleAccountId ?? payload.google_account_id ?? 0,
  );
  const { buyerEmail, buyerCount } = normalizeBuyerEmailList(
    payload.buyerEmail ?? payload.email ?? payload.buyer_email,
  );
  const customerJid =
    buyerEmail ||
    normalizeCustomerJid(
      payload.noBuyer ?? payload.customerJid ?? payload.customer_jid,
    );
  const platform = normalizePlatform(payload.platform || "shopee");
  const memberStatus =
    String(payload.memberStatus ?? payload.member_status ?? "anggota")
      .trim()
      .toLowerCase() === "kick"
      ? "kick"
      : "anggota";
  const reportStatus = normalizeReportStatusForPlatform(
    platform,
    payload.reportStatus ?? payload.report_status,
  );
  const amountRaw =
    payload.amount === undefined ? null : Number(payload.amount);
  const activeStatus = normalizeActiveStatus(
    payload.activeStatus ?? payload.active_status,
  );
  const activeStartAt = nullableDate(
    payload.activeStartAt ?? payload.active_start_at,
  );
  const activeExpiresAt = nullableDate(
    payload.activeExpiresAt ?? payload.active_expires_at,
  );
  const warrantyExpiresAt = nullableDate(
    payload.warrantyExpiresAt ?? payload.warranty_expires_at,
  );

  if (!idTrx) throw new Error("idTrx wajib diisi");
  if (!googleAccountId) throw new Error("Akun Google wajib dipilih");
  if (!buyerEmail) throw new Error("Email buyer wajib diisi");
  if (amountRaw !== null && (!Number.isFinite(amountRaw) || amountRaw < 0))
    throw new Error("Nominal tidak valid");

  const pool = getPool();
  const [accounts] = await pool.execute(
    "SELECT id FROM google_accounts WHERE id = ? AND user_id = ? LIMIT 1",
    [googleAccountId, Number(user.id)],
  );
  if (accounts.length === 0) {
    throw new Error("Akun Google tidak ditemukan");
  }

  const [result] = await pool.execute(
    `UPDATE cs_transactions
        SET pakasir_order_id = ?,
            google_account_id = ?,
            customer_jid = ?,
            buyer_email = ?,
            buyer_count = ?,
            platform = ?,
            report_status = ?,
            active_status = ?,
            member_status = ?,
            amount = COALESCE(?, amount),
            active_start_at = ?,
            active_expires_at = ?,
            warranty_expires_at = ?
      WHERE id = ?
        AND user_id = ?`,
    [
      idTrx,
      googleAccountId,
      customerJid,
      buyerEmail,
      buyerCount,
      platform,
      reportStatus,
      activeStatus,
      memberStatus,
      amountRaw === null ? null : Math.floor(amountRaw),
      activeStartAt,
      activeExpiresAt,
      warrantyExpiresAt,
      Number(transactionId),
      Number(user.id),
    ],
  );

  if (Number(result.affectedRows ?? 0) === 0) {
    throw new Error("Transaksi tidak ditemukan");
  }

  const [items] = await pool.execute(
    `SELECT tx.id, tx.pakasir_order_id, tx.pakasir_gateway_order_id, tx.google_account_id, tx.gemini_price_plan_id, tx.customer_jid,
            tx.buyer_email, tx.buyer_count, tx.amount, tx.status, tx.order_status, tx.platform, tx.active_status, tx.member_status, tx.is_manual,
            tx.active_duration_days, tx.warranty_duration_days, tx.completed_at,
            tx.active_start_at, tx.active_expires_at, tx.warranty_start_at,
            tx.warranty_expires_at, tx.warranty_status, tx.warranty_claimed_at,
            tx.warranty_claim_stock_id, tx.report_status, tx.proof_drive_file_id, tx.proof_drive_url,
            tx.proof_uploaded_at, tx.paid_at, tx.delivered_at, tx.created_at,
            ga.email AS google_account_email
       FROM cs_transactions tx
       LEFT JOIN google_accounts ga ON ga.id = tx.google_account_id
      WHERE tx.id = ? AND tx.user_id = ?
      LIMIT 1`,
    [Number(transactionId), Number(user.id)],
  );

  if (!items[0]) return null;
  return mapPaidTransactionRow({ ...items[0], stock_content: null });
}

async function updateBotWaTransactionForUser(user, transactionId, payload) {
  const idTrx = String(payload.idTrx ?? payload.id_trx ?? "").trim();
  const customerJid = normalizeCustomerJid(
    payload.customerJid ?? payload.waPembeli ?? payload.customer_jid,
  );
  const warrantyExpiresAt = nullableDate(
    payload.warrantyExpiresAt ?? payload.warranty_expires_at,
  );
  const warrantyStatus =
    String(payload.warrantyStatus ?? payload.warranty_status ?? "open")
      .trim()
      .toLowerCase() === "selesai"
      ? "selesai"
      : "open";

  if (!idTrx) throw new Error("idTRX wajib diisi");
  if (!customerJid) throw new Error("WA pembeli wajib diisi");

  const pool = getPool();
  const [duplicates] = await pool.execute(
    `SELECT id
       FROM cs_transactions
      WHERE user_id = ?
        AND pakasir_order_id = ?
        AND id <> ?
      LIMIT 1`,
    [Number(user.id), idTrx, Number(transactionId)],
  );
  if (duplicates.length > 0) {
    throw new Error(`idTRX sudah ada: ${idTrx}`);
  }

  const [result] = await pool.execute(
    `UPDATE cs_transactions
        SET pakasir_order_id = ?,
            customer_jid = ?,
            warranty_expires_at = COALESCE(?, warranty_expires_at),
            warranty_status = ?
      WHERE id = ?
        AND user_id = ?
        AND is_manual = 0`,
    [
      idTrx,
      customerJid,
      warrantyExpiresAt,
      warrantyStatus,
      Number(transactionId),
      Number(user.id),
    ],
  );

  if (Number(result.affectedRows ?? 0) === 0) {
    throw new Error("Transaksi Bot WA tidak ditemukan");
  }

  const [items] = await pool.execute(
    `SELECT tx.id, tx.pakasir_order_id, tx.pakasir_gateway_order_id, tx.google_account_id, tx.gemini_price_plan_id, tx.customer_jid,
            tx.buyer_email, tx.buyer_count, tx.amount, tx.status, tx.order_status, tx.platform,
            tx.active_status, tx.member_status, tx.is_manual, tx.active_duration_days,
            tx.warranty_duration_days, tx.completed_at, tx.active_start_at, tx.active_expires_at,
            tx.warranty_start_at, tx.warranty_expires_at, tx.warranty_status,
            tx.warranty_claimed_at, tx.warranty_claim_stock_id, tx.report_status, tx.proof_drive_file_id,
            tx.proof_drive_url, tx.proof_uploaded_at, tx.paid_at, tx.delivered_at, tx.created_at,
            ga.email AS google_account_email,
            cs.value AS stock_content,
            cs.nama_perintah
       FROM cs_transactions tx
       LEFT JOIN google_accounts ga ON ga.id = tx.google_account_id
       LEFT JOIN customer_service cs ON cs.id = tx.cs_id
      WHERE tx.id = ? AND tx.user_id = ?
      LIMIT 1`,
    [Number(transactionId), Number(user.id)],
  );

  return items[0] ? mapPaidTransactionRow(items[0]) : null;
}

async function updateTransactionReportForUser(user, transactionId, payload) {
  const reportStatus = normalizeReportStatus(
    payload.reportStatus ?? payload.report_status,
  );
  const pool = getPool();
  const [result] = await pool.execute(
    `UPDATE cs_transactions
        SET report_status = ?
      WHERE id = ?
        AND user_id = ?`,
    [reportStatus, Number(transactionId), Number(user.id)],
  );

  if (Number(result.affectedRows ?? 0) === 0) {
    throw new Error("Transaksi tidak ditemukan");
  }

  const [items] = await pool.execute(
    `SELECT tx.id, tx.pakasir_order_id, tx.pakasir_gateway_order_id, tx.google_account_id, tx.gemini_price_plan_id, tx.customer_jid,
            tx.buyer_email, tx.buyer_count, tx.amount, tx.status, tx.order_status, tx.platform,
            tx.active_status, tx.member_status, tx.is_manual, tx.active_duration_days,
            tx.warranty_duration_days, tx.completed_at, tx.active_start_at, tx.active_expires_at,
            tx.warranty_start_at, tx.warranty_expires_at, tx.warranty_status,
            tx.warranty_claimed_at, tx.warranty_claim_stock_id, tx.report_status, tx.proof_drive_file_id,
            tx.proof_drive_url, tx.proof_uploaded_at, tx.paid_at, tx.delivered_at, tx.created_at,
            ga.email AS google_account_email
       FROM cs_transactions tx
       LEFT JOIN google_accounts ga ON ga.id = tx.google_account_id
      WHERE tx.id = ? AND tx.user_id = ?
      LIMIT 1`,
    [Number(transactionId), Number(user.id)],
  );

  return items[0]
    ? mapPaidTransactionRow({ ...items[0], stock_content: null })
    : null;
}

async function deleteTransactionForUser(user, transactionId) {
  const pool = getPool();
  const [result] = await pool.execute(
    "DELETE FROM cs_transactions WHERE id = ? AND user_id = ?",
    [Number(transactionId), Number(user.id)],
  );
  return Number(result.affectedRows ?? 0) > 0;
}

export const csPaymentService = {
  createBuyTransaction,
  createOwnerManualTransaction,
  sendTransactionTestimonial,
  sendTransactionTestimonialForUser,
  markPaidFromPakasir,
  deliverPaidTransaction,
  checkAndDeliverPayment,
  cancelTransactionForCustomer,
  handleCustomerRelayInput,
  handleOwnerDone,
  handleWebhookAndDeliver,
  claimWarrantyForCustomer,
  listPaidTransactionsForUser,
  createManualTransactionForUser,
  sendManualTransactionTemplate,
  updateTransactionForUser,
  updateTransactionReportForUser,
  deleteTransactionForUser,
};
