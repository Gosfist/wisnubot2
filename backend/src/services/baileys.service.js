import pkg from "socketon";
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
  generateWAMessageFromContent,
} = pkg;
import { Boom } from "@hapi/boom";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import QRCode from "qrcode";
import { config } from "../config/env.js";
import { getPool } from "../config/database.js";
import { customerServiceService } from "./customer-service.service.js";
import { csPaymentService } from "./cs-payment.service.js";
import { messageService } from "./message.service.js";

import { logger } from "../utils/logger.js";

const PAIRING_BROWSER = ["Ubuntu", "Chrome", "22.04.4"];
const DEFAULT_BROWSER = ["Mac OS", "Desktop", "14.4.1"];
const PAYMENT_SUCCESS_IMAGE_PATH = new URL("../../uploads/asset/sukses.png", import.meta.url);
const PAYMENT_FAILED_IMAGE_PATH = new URL("../../uploads/asset/gagal.png", import.meta.url);
const PAYMENT_FAILED_TEXT =
  "Pembayaran gagal atau belum terdeteksi. Silakan hubungi owner jika merasa sudah melakukan transaksi.";

function getPaymentStatusImageBuffer(status) {
  const assetUrl = status === "success" ? PAYMENT_SUCCESS_IMAGE_PATH : PAYMENT_FAILED_IMAGE_PATH;
  if (!existsSync(assetUrl)) {
    logger.warn(`Payment status image not found: ${assetUrl.pathname}`);
    return null;
  }
  return readFileSync(assetUrl);
}

function extractIncomingTextContent(message) {
  if (!message || typeof message !== "object") {
    return "";
  }

  const nestedMessage =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message;
  if (nestedMessage) {
    const nestedText = extractIncomingTextContent(nestedMessage);
    if (nestedText) return nestedText;
  }

  const nativeFlowParamsJson =
    message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (nativeFlowParamsJson) {
    try {
      const params = JSON.parse(nativeFlowParamsJson);
      const id =
        params.id ||
        params.button_id ||
        params.selectedId ||
        params.selectedRowId ||
        params.payload;
      if (typeof id === "string" && id.trim()) {
        return id;
      }
    } catch (err) {
      // ignore parse error
    }
  }

  if (typeof message.conversation === "string") {
    return message.conversation;
  }

  if (typeof message.extendedTextMessage?.text === "string") {
    return message.extendedTextMessage.text;
  }

  if (typeof message.imageMessage?.caption === "string") {
    return message.imageMessage.caption;
  }

  if (typeof message.videoMessage?.caption === "string") {
    return message.videoMessage.caption;
  }

  if (typeof message.buttonsResponseMessage?.selectedButtonId === "string") {
    return message.buttonsResponseMessage.selectedButtonId;
  }

  if (typeof message.buttonReplyMessage?.id === "string") {
    return message.buttonReplyMessage.id;
  }

  if (typeof message.buttonsResponseMessage?.selectedDisplayText === "string") {
    return message.buttonsResponseMessage.selectedDisplayText;
  }

  if (
    typeof message.listResponseMessage?.singleSelectReply?.selectedRowId ===
    "string"
  ) {
    return message.listResponseMessage.singleSelectReply.selectedRowId;
  }

  if (typeof message.listResponseMessage?.title === "string") {
    return message.listResponseMessage.title;
  }

  if (typeof message.templateButtonReplyMessage?.selectedId === "string") {
    return message.templateButtonReplyMessage.selectedId;
  }

  if (
    typeof message.templateButtonReplyMessage?.selectedDisplayText === "string"
  ) {
    return message.templateButtonReplyMessage.selectedDisplayText;
  }

  return "";
}

function extractQuotedMessageId(message) {
  if (!message || typeof message !== "object") {
    return "";
  }

  return (
    message.extendedTextMessage?.contextInfo?.stanzaId ||
    message.imageMessage?.contextInfo?.stanzaId ||
    message.videoMessage?.contextInfo?.stanzaId ||
    message.interactiveResponseMessage?.contextInfo?.stanzaId ||
    ""
  );
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

function isOwnerMessage(context, remoteJid) {
  const ownerJid = normalizeJid(context?.userPhoneNumber);
  return Boolean(ownerJid && ownerJid === String(remoteJid));
}

function buildSingleSelectButton(label, id, sectionTitle = "Pilih Menu") {
  return {
    name: "single_select",
    buttonParamsJson: JSON.stringify({
      title: label,
      sections: [
        {
          title: sectionTitle,
          rows: [
            {
              title: label,
              id,
            },
          ],
        },
      ],
    }),
  };
}

function buildCommandInteractiveMessage(remoteJid, entry) {
  const buttons = [];
  for (const button of entry.buttons ?? []) {
    const label = String(button.label ?? "").trim();
    if (!label) continue;

    let id = "";
    if (button.buttonType === "link" && button.targetCommand) {
      id = String(button.targetCommand)
        .replace(/^[/.]+/, "")
        .toLowerCase();
    } else if (button.buttonType === "buy") {
      if (!button.id) continue;
      id = `cs_buy:${entry.id}:${button.id}`;
    } else if (button.buttonType === "reply" && button.replyText) {
      id = `cs_reply:${button.id}`;
    }

    if (!id) continue;
    buttons.push(buildSingleSelectButton(label, id));
  }

  if (buttons.length === 0) {
    return null;
  }

  return generateWAMessageFromContent(
    remoteJid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 3,
          },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({
              text: entry.value,
            }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              text: "By Wisnu Store",
            }),
            header: proto.Message.InteractiveMessage.Header.create({
              title: "",
              subtitle: "",
              hasMediaAttachment: false,
            }),
            nativeFlowMessage:
              proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons,
              }),
          }),
        },
      },
    },
    {},
  );
}

function buildWelcomeStartButtonMessage(remoteJid, text) {
  return generateWAMessageFromContent(
    remoteJid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 3,
          },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({ text }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              text: "By Wisnu Store",
            }),
            header: proto.Message.InteractiveMessage.Header.create({
              title: "",
              subtitle: "",
              hasMediaAttachment: false,
            }),
            nativeFlowMessage:
              proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: [
                  buildSingleSelectButton("Start", "start"),
                ],
              }),
          }),
        },
      },
    },
    {},
  );
}

function buildPaymentCaption(tx) {
  const priceText = tx.price.toLocaleString("id-ID");
  const adminFeeText = tx.adminFee.toLocaleString("id-ID");
  const totalPaymentText = tx.totalPayment.toLocaleString("id-ID");
  const idTrx = tx.idTrx ?? tx.orderId;
  return (
    `idTrx: ${idTrx}\n` +
    `Harga: Rp ${priceText}\n` +
    `Biaya Admin: Rp ${adminFeeText}\n` +
    `Total Bayar: Rp ${totalPaymentText}\n` +
    `Exp: ${tx.expiryMinutes ?? 5} menit`
  );
}

function buildPaymentActionContent(tx, qrImage = null, notice = "") {
  const bodyText = notice
    ? `${buildPaymentCaption(tx)}\n\n${notice}`
    : buildPaymentCaption(tx);

  return {
    interactiveMessage: {
      title: bodyText,
      footer: "By Wisnu Store",
      ...(qrImage ? { image: qrImage } : {}),
      buttons: [
        {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: "Bayar Sekarang",
            url: tx.paymentUrl,
            merchant_url: tx.paymentUrl,
          }),
        },
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "Cek Pembayaran",
            sections: [
              {
                title: "Status Transaksi",
                rows: [
                  {
                    title: "Cek Pembayaran",
                    description: "Tekan untuk cek status pembayaran terbaru.",
                    id: `cs_checktrx:${tx.idTrx ?? tx.orderId}`,
                  },
                ],
              },
            ],
          }),
        },
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "Batal",
            sections: [
              {
                title: "Batalkan Transaksi",
                rows: [
                  {
                    title: "Batal",
                    description: "Tekan untuk membatalkan transaksi ini.",
                    id: `cs_canceltrx:${tx.idTrx ?? tx.orderId}`,
                  },
                ],
              },
            ],
          }),
        },
      ],
    },
  };
}

function buildPaymentActionMessage(remoteJid, tx, notice = "") {
  const content = buildPaymentActionContent(tx, null, notice);
  return generateWAMessageFromContent(
    remoteJid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 3,
          },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({
              text: content.interactiveMessage.title,
            }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              text: content.interactiveMessage.footer,
            }),
            header: proto.Message.InteractiveMessage.Header.create({
              title: "",
              subtitle: "",
              hasMediaAttachment: false,
            }),
            nativeFlowMessage:
              proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: content.interactiveMessage.buttons,
              }),
          }),
        },
      },
    },
    {},
  );
}

class BaileysManager {
  constructor() {
    this.connections = new Map();
    this.lastQr = new Map();
    this.expectedPhoneNumbers = new Map();
    this.reconnectAttempts = new Map();
    this.reconnectTimers = new Map();
    this.connectingBots = new Set();
    this.manualDisconnectBots = new Set();
    // Tracks when each bot's connection became ready (epoch seconds).
    // Used to skip offline/backlog messages whose messageTimestamp is older.
    this.connectionReadyAt = new Map();
    this.mismatchDisconnectPayloads = new Map();
    this.pendingConnections = new Map();
    this.pendingOwnerManualTransactions = new Map();
    this.nextPendingBotId = -1;
    this.io = null;
  }

  normalizeWhatsappPhoneNumber(rawValue) {
    const digits = String(rawValue ?? "").replace(/\D/g, "");
    if (!digits) {
      return "";
    }

    if (digits.startsWith("62")) {
      return digits;
    }

    if (digits.startsWith("0") && digits.length > 1) {
      return `62${digits.slice(1)}`;
    }

    if (digits.startsWith("8")) {
      return `62${digits}`;
    }

    return digits;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async requestPairingCodeWithRetry(sock, phoneNumber, options = {}) {
    const maxAttempts = options.maxAttempts ?? 8;
    const retryDelayMs = options.retryDelayMs ?? 750;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await sock.requestPairingCode(phoneNumber);
      } catch (error) {
        lastError = error;
        const message = String(error?.message || "");
        const statusCode = Number(error?.output?.statusCode || 0);
        const shouldRetry =
          message.includes("Connection Closed") || statusCode === 428;

        if (!shouldRetry || attempt === maxAttempts) {
          throw error;
        }

        logger.warn(
          `Pairing code request not ready yet for ${phoneNumber}. Retrying (${attempt}/${maxAttempts})...`,
        );
        await this.sleep(retryDelayMs);
      }
    }

    throw lastError;
  }

  async requestPairingCodeLikeSimpleMd(sock, phoneNumber, options = {}) {
    const warmupDelayMs = options.warmupDelayMs ?? 3_000;
    await this.sleep(warmupDelayMs);
    return await this.requestPairingCodeWithRetry(sock, phoneNumber, {
      maxAttempts: options.maxAttempts ?? 10,
      retryDelayMs: options.retryDelayMs ?? 1_000,
    });
  }

  setExpectedPhoneNumber(botId, phoneNumber) {
    const key = Number(botId);
    const normalized = this.normalizeWhatsappPhoneNumber(phoneNumber);
    if (!normalized) {
      this.expectedPhoneNumbers.delete(key);
      return;
    }
    this.expectedPhoneNumbers.set(key, normalized);
  }

  clearReconnectState(botId) {
    const key = Number(botId);
    const timer = this.reconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(key);
    }
    this.reconnectAttempts.delete(key);
  }

  allocatePendingBotId() {
    const nextId = this.nextPendingBotId;
    this.nextPendingBotId -= 1;
    return nextId;
  }

  buildSessionName(userId, expectedPhoneNumber = "") {
    const normalizedPhoneNumber =
      this.normalizeWhatsappPhoneNumber(expectedPhoneNumber);
    if (normalizedPhoneNumber) {
      return normalizedPhoneNumber;
    }
    return `session_${userId}_${Date.now()}`;
  }

  isPendingBotId(botId) {
    return Number(botId) < 0;
  }

  async persistConnectedBot(
    userId,
    sessionName,
    phoneNumber,
    ownerPhoneNumber = null,
    botPurpose = "main",
  ) {
    const pool = getPool();

    const [result] = await pool.execute(
      "INSERT INTO bots (user_id, phone_number, owner_phone_number, session_name, is_online, expired_at, bot_purpose) VALUES (?, ?, ?, ?, 1, ?, ?)",
      [userId, phoneNumber, ownerPhoneNumber || null, sessionName, null, botPurpose],
    );

    return Number(result.insertId);
  }

  promoteConnection(tempBotId, realBotId) {
    const tempKey = Number(tempBotId);
    const realKey = Number(realBotId);
    const connection = this.connections.get(tempKey);
    if (connection) {
      this.connections.delete(tempKey);
      this.connections.set(realKey, { ...connection, botId: realKey });
    }

    const expectedPhone = this.expectedPhoneNumbers.get(tempKey);
    this.expectedPhoneNumbers.delete(tempKey);
    if (expectedPhone) {
      this.expectedPhoneNumbers.set(realKey, expectedPhone);
    }

    const mismatchPayload = this.mismatchDisconnectPayloads.get(tempKey);
    this.mismatchDisconnectPayloads.delete(tempKey);
    if (mismatchPayload) {
      this.mismatchDisconnectPayloads.set(realKey, {
        ...mismatchPayload,
        botId: realKey,
      });
    }

    if (this.manualDisconnectBots.has(tempKey)) {
      this.manualDisconnectBots.delete(tempKey);
      this.manualDisconnectBots.add(realKey);
    }
    if (this.connectingBots.has(tempKey)) {
      this.connectingBots.delete(tempKey);
      this.connectingBots.add(realKey);
    }
  }

  getPendingPairing(sessionName) {
    return this.pendingConnections.get(String(sessionName)) || null;
  }

  async startPendingPairing(userId, options = {}) {
    const tempBotId = this.allocatePendingBotId();
    const expectedPhoneNumber = this.normalizeWhatsappPhoneNumber(
      options.expectedPhoneNumber,
    );
    const sessionName = this.buildSessionName(userId, expectedPhoneNumber);

    this.removeSessionDirectory(sessionName);
    this.pendingConnections.delete(sessionName);

    const ownerPhoneNumber = this.normalizeWhatsappPhoneNumber(
      options.ownerPhoneNumber,
    );

    this.pendingConnections.set(sessionName, {
      tempBotId,
      userId: Number(userId),
      sessionName,
      expectedPhoneNumber,
      ownerPhoneNumber: ownerPhoneNumber || null,
      botPurpose: options.botPurpose === "push_contact" ? "push_contact" : "main",
      usePairingCode: options.usePairingCode === true,
    });

    const sock = await this.connect(userId, tempBotId, sessionName, {
      persistOnConnect: true,
      usePairingCode: options.usePairingCode === true,
      botPurpose: options.botPurpose === "push_contact" ? "push_contact" : "main",
      ...(expectedPhoneNumber ? { expectedPhoneNumber } : {}),
    });

    let pairingCode = null;
    if (options.usePairingCode && expectedPhoneNumber) {
      pairingCode = await this.requestPairingCodeLikeSimpleMd(
        sock,
        expectedPhoneNumber,
      );
    }

    return { tempBotId, sessionName, pairingCode };
  }

  async restartPendingPairing(userId, sessionName) {
    const pending = this.getPendingPairing(sessionName);
    if (!pending || Number(pending.userId) !== Number(userId)) {
      return null;
    }

    await this.forceResetBotConnection(userId, pending.tempBotId, sessionName, {
      removeSession: true,
    });
    const sock = await this.connect(userId, pending.tempBotId, sessionName, {
      persistOnConnect: true,
      usePairingCode: pending.usePairingCode === true,
      ...(pending.expectedPhoneNumber
        ? { expectedPhoneNumber: pending.expectedPhoneNumber }
        : {}),
    });

    let pairingCode = null;
    if (pending.usePairingCode && pending.expectedPhoneNumber) {
      pairingCode = await this.requestPairingCodeLikeSimpleMd(
        sock,
        pending.expectedPhoneNumber,
      );
    }

    return { ...pending, pairingCode };
  }

  async cancelPendingPairing(userId, sessionName) {
    const pending = this.getPendingPairing(sessionName);
    if (!pending || Number(pending.userId) !== Number(userId)) {
      return false;
    }

    await this.forceResetBotConnection(userId, pending.tempBotId, sessionName, {
      removeSession: true,
    });
    this.pendingConnections.delete(sessionName);
    this.lastQr.delete(Number(userId));
    return true;
  }

  async deleteBotRecord(botId, sessionName) {
    const key = Number(botId);

    // Gracefully logout socket to stop background processes (creds.update, etc)
    const conn = this.connections.get(key);
    if (conn?.sock) {
      try {
        await conn.sock.logout();
      } catch (err) {
        // Ignore errors during logout
      }
    }

    if (this.isPendingBotId(key)) {
      this.pendingConnections.delete(String(sessionName));
      this.clearReconnectState(key);
      this.connectingBots.delete(key);
      this.manualDisconnectBots.delete(key);
      this.expectedPhoneNumbers.delete(key);
      this.mismatchDisconnectPayloads.delete(key);
      this.connections.delete(key);
      this.removeSessionDirectory(sessionName);
      return true;
    }
    const pool = getPool();

    this.clearReconnectState(key);
    this.connectingBots.delete(key);
    this.manualDisconnectBots.delete(key);
    this.expectedPhoneNumbers.delete(key);
    this.mismatchDisconnectPayloads.delete(key);
    this.connections.delete(key);

    await pool.execute("DELETE FROM `groups` WHERE bot_id = ?", [key]);
    const [result] = await pool.execute("DELETE FROM bots WHERE id = ?", [key]);

    // Small delay to ensure Baileys releases the file locks after logout
    await this.sleep(500);
    this.removeSessionDirectory(sessionName);

    return Number(result?.affectedRows || 0) > 0;
  }

  async scheduleReconnect(userId, botId, sessionName, reason) {
    const key = Number(botId);
    const maxAttempts = 6;
    const currentAttempt = (this.reconnectAttempts.get(key) || 0) + 1;
    this.reconnectAttempts.set(key, currentAttempt);

    if (currentAttempt > maxAttempts) {
      logger.warn(
        `Reconnect limit reached for user ${userId}, bot ${botId}. Keeping bot record and session. Last reason: ${reason}`,
      );
      this.clearReconnectState(key);
      if (this.io) {
        this.io.to(`user_${userId}`).emit("disconnected", {
          reason: "reconnect_limit",
          botId,
        });
      }
      return;
    }

    const delayMs = Math.min(30000, 5000 * 2 ** (currentAttempt - 1));
    logger.info(
      `Reconnecting bot for user ${userId} (attempt ${currentAttempt}/${maxAttempts}) in ${delayMs}ms...`,
    );

    const existingTimer = this.reconnectTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(key);
      this.connect(userId, botId, sessionName).catch((err) => {
        logger.error(
          err,
          `Reconnect attempt failed for user ${userId}, bot ${botId}`,
        );
      });
    }, delayMs);

    this.reconnectTimers.set(key, timer);
  }

  setIO(io) {
    this.io = io;
  }

  isConnectInProgress(botId) {
    return this.connectingBots.has(Number(botId));
  }

  async forceResetBotConnection(userId, botId, sessionName, options = {}) {
    const key = Number(botId);
    const shouldRemoveSession = options.removeSession !== false;

    this.clearReconnectState(key);
    this.connectingBots.delete(key);
    this.manualDisconnectBots.delete(key);
    this.expectedPhoneNumbers.delete(key);
    this.mismatchDisconnectPayloads.delete(key);

    const conn = this.connections.get(key);
    if (conn?.sock) {
      try {
        await conn.sock.logout();
      } catch {
        // Ignore logout errors during force reset
      }
      try {
        conn.sock.end();
      } catch {
        // Ignore end errors during force reset
      }
    }

    this.connections.delete(key);
    this.lastQr.delete(Number(userId));

    if (shouldRemoveSession && sessionName) {
      this.removeSessionDirectory(sessionName);
    }
  }

  getSocket(userId) {
    for (const conn of this.connections.values()) {
      if (Number(conn.userId) === Number(userId)) {
        return conn.sock;
      }
    }
    return null;
  }

  getSocketForBot(botId) {
    const conn = this.connections.get(Number(botId));
    return conn?.sock || null;
  }

  async getPreferredBroadcastConnection(userId, preferredBotIds = []) {
    const pool = getPool();
    const normalizedPreferredBotIds = Array.isArray(preferredBotIds)
      ? [
          ...new Set(
            preferredBotIds
              .map((id) => parseInt(id, 10))
              .filter((id) => id > 0),
          ),
        ]
      : [];
    const clauses = ["user_id = ?", "is_online = 1"];
    const params = [userId];

    if (normalizedPreferredBotIds.length > 0) {
      clauses.push(
        `id IN (${normalizedPreferredBotIds.map(() => "?").join(",")})`,
      );
      params.push(...normalizedPreferredBotIds);
    }

    const [bots] = await pool.execute(
      `SELECT id, user_id, phone_number, bot_purpose
       FROM bots
       WHERE ${clauses.join(" AND ")}
         AND COALESCE(bot_purpose, 'main') = 'main'
       ORDER BY created_at DESC`,
      params,
    );

    for (const bot of bots) {
      const sock = this.getSocketForBot(bot.id);
      if (sock) {
        return {
          botId: Number(bot.id),
          userId: Number(bot.user_id),
          phoneNumber: bot.phone_number || null,
          botPurpose: bot.bot_purpose || "main",
          sock,
        };
      }
    }

    return null;
  }

  emitLatestQr(userId) {
    const qr = this.lastQr.get(Number(userId));
    if (qr && this.io) {
      this.io.to(`user_${userId}`).emit("qr", { qr });
    }
  }

  createBaileysLogger(bindings = { module: "baileys" }) {
    const base = logger.child(bindings);

    const normalize = (args) => {
      const [first, second, ...rest] = args;
      const hasObjectFirst =
        first && typeof first === "object" && !Array.isArray(first);
      const obj = hasObjectFirst ? first : undefined;
      const msg = hasObjectFirst
        ? typeof second === "string"
          ? second
          : ""
        : typeof first === "string"
          ? first
          : "";
      const extra = hasObjectFirst
        ? rest
        : [second, ...rest].filter((item) => item !== undefined);
      return { obj, msg, extra };
    };

    const shouldDowngradeInitQueryError = (obj, msg) => {
      const text =
        `${msg || ""} ${obj?.err?.message || ""} ${obj?.message || ""}`.toLowerCase();
      return text.includes("init queries") && text.includes("bad-request");
    };

    return {
      child: (nextBindings) =>
        this.createBaileysLogger({ ...bindings, ...nextBindings }),
      trace: (...args) => {},
      debug: (...args) => {},
      info: (...args) => {},
      warn: (...args) => {
        const { obj, msg, extra } = normalize(args);
        if (obj) {
          base.warn(obj, msg, ...extra);
        } else {
          base.warn(msg, ...extra);
        }
      },
      error: (...args) => {
        const { obj, msg, extra } = normalize(args);
        if (shouldDowngradeInitQueryError(obj, msg)) {
          base.warn(obj, "Non-fatal Baileys init query issue; continuing");
          return;
        }
        if (obj) {
          base.error(obj, msg, ...extra);
        } else {
          base.error(msg, ...extra);
        }
      },
      fatal: (...args) => {
        const { obj, msg, extra } = normalize(args);
        if (obj) {
          base.fatal(obj, msg, ...extra);
        } else {
          base.fatal(msg, ...extra);
        }
      },
    };
  }

  async syncGroupsToDatabase(userId, botId, sock) {
    const pool = getPool();
    const waGroups = await sock.groupFetchAllParticipating();
    const groupEntries = Object.values(waGroups);

    for (const group of groupEntries) {
      const [existing] = await pool.execute(
        "SELECT id FROM `groups` WHERE bot_id = ? AND group_jid = ?",
        [botId, group.id],
      );

      if (existing.length === 0) {
        await pool.execute(
          "INSERT INTO `groups` (bot_id, group_jid, name, member_count, is_active) VALUES (?, ?, ?, ?, ?)",
          [
            botId,
            group.id,
            group.subject || "Unknown Group",
            group.participants?.length || 0,
            0,
          ],
        );
      } else {
        await pool.execute(
          "UPDATE `groups` SET name = ?, member_count = ? WHERE id = ?",
          [
            group.subject || "Unknown Group",
            group.participants?.length || 0,
            existing[0].id,
          ],
        );
      }
    }

    logger.info(
      `Synced ${groupEntries.length} groups to DB for user ${userId}`,
    );
  }

  async connect(userId, botId, sessionName, options = {}) {
    const key = Number(botId);
    let runtimeBotId = key;
    const isPendingPairing = this.isPendingBotId(key);
    let botPurpose = options.botPurpose === "push_contact" ? "push_contact" : "main";
    if (!isPendingPairing && !options.botPurpose) {
      try {
        const pool = getPool();
        const [rows] = await pool.execute(
          "SELECT bot_purpose FROM bots WHERE id = ? LIMIT 1",
          [key],
        );
        botPurpose = rows[0]?.bot_purpose === "push_contact" ? "push_contact" : "main";
      } catch {
        botPurpose = "main";
      }
    }
    const expectedPhoneNumber = this.normalizeWhatsappPhoneNumber(
      options.expectedPhoneNumber,
    );
    if (expectedPhoneNumber) {
      this.setExpectedPhoneNumber(key, expectedPhoneNumber);
    }
    const existing = this.connections.get(key);
    if (existing?.sock) {
      return existing.sock;
    }

    if (this.connectingBots.has(key)) {
      logger.info(
        `Connect already in progress for user ${userId}, bot ${botId}`,
      );
      return null;
    }

    this.connectingBots.add(key);
    try {
      const sessionDir = join(config.sessionDir, sessionName);
      mkdirSync(sessionDir, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger: this.createBaileysLogger({ module: "baileys" }),
        browser: options.usePairingCode ? PAIRING_BROWSER : DEFAULT_BROWSER,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: true,
        retryRequestDelayMs: 1000,
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 10_000,
        defaultQueryTimeoutMs: 60_000,
        patchMessageBeforeSending: (message) => {
          const requiresPatch = !!(
            message.buttonsMessage ||
            message.templateMessage ||
            message.listMessage
          );
          if (requiresPatch) {
            message = {
              viewOnceMessage: {
                message: {
                  messageContextInfo: {
                    deviceListMetadataVersion: 3,
                    deviceListMetadata: {},
                  },
                  ...message,
                },
              },
            };
          }
          return message;
        },
      });

      // Override sendMessage seperti di hydromd untuk fitur-fitur button/interactive
      const _sendMessage = sock.sendMessage;
      sock.sendMessage = async (jid, content, options = {}) => {
        if (!options.messageId) {
          const { randomBytes } = await import("crypto");
          options.messageId = randomBytes(16).toString("hex").toUpperCase();
        }
        if (content.text) {
          options.userAgent = "WhatsApp/2.23.13.76 A";
        }
        return await _sendMessage(jid, content, options);
      };

      this.connections.set(key, {
        sock,
        botId,
        userId,
        sessionName,
        botPurpose,
      });
      this.manualDisconnectBots.delete(key);

      sock.ev.on("messages.upsert", async (payload) => {
        try {
          // Hanya tangkap pesan notifikasi langsung (bukan load history)
          if (payload.type !== "notify") return;

          const messages = Array.isArray(payload?.messages)
            ? payload.messages
            : [];

          for (const message of messages) {
            // Abaikan pesan yang dikirim SEBELUM bot connection-ready saat ini
            // (mis. pesan offline yang ter-replay saat reconnect).
            const rawTs = message?.messageTimestamp;
            let msgTimestamp =
              typeof rawTs === "number"
                ? rawTs
                : typeof rawTs?.toNumber === "function"
                  ? rawTs.toNumber()
                  : Number(rawTs ?? 0);
            // Auto-detect: jika nilai terlalu besar berarti dalam milidetik,
            // konversi ke detik agar bisa dibandingkan dengan readyAt.
            if (msgTimestamp > 1e12) {
              msgTimestamp = Math.floor(msgTimestamp / 1000);
            }
            const readyAt =
              this.connectionReadyAt.get(runtimeBotId) ??
              this.connectionReadyAt.get(key) ??
              0;
            // Pesan yang punya atribut "offline" dari WA pasti backlog.
            const offlineCount = Number(
              message?.key?.offline ?? message?.offline ?? 0,
            );
            if (offlineCount > 0) {
              logger.info(
                `Skip offline-flagged message (offline=${offlineCount}) from ${message?.key?.remoteJid}`,
              );
              continue;
            }
            // Tambah toleransi 2 detik agar pesan yang masuk persis bersamaan
            // dengan event "open" tetap diproses.
            if (!readyAt) {
              logger.info(
                `Skip message: bot not yet ready (ts=${msgTimestamp}) from ${message?.key?.remoteJid}`,
              );
              continue;
            }
            if (msgTimestamp && msgTimestamp < readyAt - 2) {
              logger.info(
                `Skip backlog (ts=${msgTimestamp}, readyAt=${readyAt}, diff=${readyAt - msgTimestamp}s) from ${message?.key?.remoteJid}`,
              );
              continue;
            }
            logger.info(
              `Process message (ts=${msgTimestamp}, readyAt=${readyAt}) from ${message?.key?.remoteJid}`,
            );

            const remoteJid = String(message?.key?.remoteJid ?? "");
            const isFromMe = Boolean(message?.key?.fromMe);
            const hasMessagePayload =
              Boolean(message?.message) &&
              !message?.message?.protocolMessage &&
              !message?.message?.reactionMessage;

            if (!remoteJid || isFromMe || !hasMessagePayload) {
              continue;
            }

            if (
              remoteJid === "status@broadcast" ||
              remoteJid.endsWith("@g.us") ||
              remoteJid.endsWith("@broadcast")
            ) {
              continue;
            }

            const activeConnection =
              this.connections.get(runtimeBotId) ?? this.connections.get(key);
            const activeBotId = Number(activeConnection?.botId ?? runtimeBotId);
            if (activeConnection?.botPurpose === "push_contact") {
              continue;
            }
            const incomingText = extractIncomingTextContent(message.message)
              .trim()
              .toLowerCase();

            await messageService.markIncomingMessageAsRead(
              sock,
              message.key,
              remoteJid,
            );

            const customerServiceContext =
              await customerServiceService.resolveInboundContext(activeBotId);
            if (!customerServiceContext) {
              continue;
            }

            const pendingOwnerManual = this.pendingOwnerManualTransactions.get(remoteJid);
            if (
              pendingOwnerManual &&
              Number(pendingOwnerManual.userId) === Number(customerServiceContext.userId) &&
              incomingText &&
              !incomingText.startsWith("cs_")
            ) {
              try {
                const rawText = extractIncomingTextContent(message.message).trim();
                const [platformRaw, customerRaw] = rawText.split("|").map((part) => part.trim());
                if (!platformRaw) {
                  await messageService.sendCustomerServiceMessage(
                    sock,
                    message.key,
                    remoteJid,
                    "Platform wajib diisi. Contoh: shopee | 628xxxxxxxxxx",
                  );
                  continue;
                }

                const tx = await csPaymentService.createOwnerManualTransaction({
                  userId: customerServiceContext.userId,
                  csId: pendingOwnerManual.csId,
                  buttonId: pendingOwnerManual.buttonId,
                  ownerJid: remoteJid,
                  customerJid: customerRaw || remoteJid,
                  platform: platformRaw,
                });
                await csPaymentService.sendTransactionTestimonial(sock, tx);
                this.pendingOwnerManualTransactions.delete(remoteJid);
                await messageService.sendCustomerServiceMessage(
                  sock,
                  message.key,
                  remoteJid,
                  `Transaksi manual berhasil dicatat.\n\nidTrx: ${tx.idTrx}\nProduk: /${tx.commandName}\nPlatform: ${tx.platform}\nNominal: Rp ${tx.amount.toLocaleString("id-ID")}`,
                );
              } catch (err) {
                this.pendingOwnerManualTransactions.delete(remoteJid);
                await messageService.sendCustomerServiceMessage(
                  sock,
                  message.key,
                  remoteJid,
                  err instanceof Error ? err.message : "Gagal mencatat transaksi manual.",
                );
              }
              continue;
            }

            const quotedMessageId = extractQuotedMessageId(message.message);
            if (
              await csPaymentService.handleOwnerDone({
                userId: customerServiceContext.userId,
                ownerJid: remoteJid,
                quotedMessageId,
                text: incomingText,
                sock,
              })
            ) {
              continue;
            }

            if (
              incomingText &&
              !incomingText.startsWith("cs_") &&
              (await csPaymentService.handleCustomerRelayInput({
                userId: customerServiceContext.userId,
                customerJid: remoteJid,
                text: extractIncomingTextContent(message.message).trim(),
                sock,
              }))
            ) {
              continue;
            }

            if (incomingText.startsWith("cs_buy:")) {
              const [, csIdRaw, buttonIdRaw] = incomingText.split(":");
              const csId = Number(csIdRaw);
              const buttonId = Number(buttonIdRaw);
              logger.info(
                `Customer service buy button clicked: csId=${csId}, buttonId=${buttonId || "-"}, customer=${remoteJid}`,
              );
              try {
                if (isOwnerMessage(customerServiceContext, remoteJid)) {
                  this.pendingOwnerManualTransactions.set(remoteJid, {
                    userId: customerServiceContext.userId,
                    csId,
                    buttonId: Number.isFinite(buttonId) ? buttonId : null,
                  });
                  await messageService.sendCustomerServiceMessage(
                    sock,
                    message.key,
                    remoteJid,
                    "Owner terdeteksi. Transaksi akan dicatat tanpa payment gateway.\n\nKetik platform dan nomor customer dengan format:\nplatform | nomor customer\n\nContoh: shopee | 6281234567890",
                  );
                  continue;
                }

                const tx = await csPaymentService.createBuyTransaction({
                  userId: customerServiceContext.userId,
                  csId,
                  buttonId: Number.isFinite(buttonId) ? buttonId : null,
                  customerJid: remoteJid,
                });
                const qrImage = await QRCode.toBuffer(tx.qrisString, {
                  type: "png",
                  errorCorrectionLevel: "M",
                  margin: 2,
                  width: 720,
                });
                const paymentActionContent = buildPaymentActionContent(
                  tx,
                  qrImage,
                );
                await messageService.sendCustomerServiceInteractiveMessage(
                  sock,
                  message.key,
                  remoteJid,
                  paymentActionContent,
                );
              } catch (err) {
                await messageService.sendCustomerServiceMessage(
                  sock,
                  message.key,
                  remoteJid,
                  err instanceof Error
                    ? err.message
                    : "Gagal membuat link pembayaran.",
                );
              }
              continue;
            }

            if (
              incomingText.startsWith("cs_checktrx:") ||
              incomingText.startsWith("cs_checkpay:")
            ) {
              const idTrx = incomingText.replace(/^cs_check(?:trx|pay):/, "").trim();
              logger.info(
                `Customer service payment check clicked: idTrx=${idTrx}, customer=${remoteJid}`,
              );
              try {
                const result = await csPaymentService.checkAndDeliverPayment({
                  userId: customerServiceContext.userId,
                  idTrx,
                  customerJid: remoteJid,
                  sock,
                });
                if (!result.paid) {
                  const failedImage = getPaymentStatusImageBuffer("failed");
                  if (failedImage) {
                    await messageService.sendCustomerServiceImageMessage(
                      sock,
                      message.key,
                      remoteJid,
                      failedImage,
                      PAYMENT_FAILED_TEXT,
                    );
                  } else {
                    await messageService.sendCustomerServiceMessage(
                      sock,
                      message.key,
                      remoteJid,
                      PAYMENT_FAILED_TEXT,
                    );
                  }
                }
              } catch (err) {
                logger.warn(err, "Customer service payment check failed");
                const failedImage = getPaymentStatusImageBuffer("failed");
                if (failedImage) {
                  await messageService.sendCustomerServiceImageMessage(
                    sock,
                    message.key,
                    remoteJid,
                    failedImage,
                    PAYMENT_FAILED_TEXT,
                  );
                } else {
                  await messageService.sendCustomerServiceMessage(
                    sock,
                    message.key,
                    remoteJid,
                    PAYMENT_FAILED_TEXT,
                  );
                }
              }
              continue;
            }

            if (incomingText.startsWith("cs_canceltrx:")) {
              const idTrx = incomingText.replace(/^cs_canceltrx:/, "").trim();
              logger.info(
                `Customer service payment cancel clicked: idTrx=${idTrx}, customer=${remoteJid}`,
              );
              try {
                const result = await csPaymentService.cancelTransactionForCustomer({
                  userId: customerServiceContext.userId,
                  idTrx,
                  customerJid: remoteJid,
                });
                await messageService.sendCustomerServiceMessage(
                  sock,
                  message.key,
                  remoteJid,
                  result.message || "Transaksi dibatalkan.",
                );
              } catch (err) {
                logger.warn(err, "Customer service payment cancel failed");
                await messageService.sendCustomerServiceMessage(
                  sock,
                  message.key,
                  remoteJid,
                  err instanceof Error ? err.message : "Gagal membatalkan transaksi.",
                );
              }
              continue;
            }

            if (incomingText.startsWith("cs_reply:")) {
              const buttonId = Number(incomingText.split(":")[1]);
              const action = await customerServiceService.getButtonAction(
                customerServiceContext,
                buttonId,
              );
              if (action?.replyText) {
                await messageService.sendCustomerServiceMessage(
                  sock,
                  message.key,
                  remoteJid,
                  action.replyText,
                );
              }
              continue;
            }

            const reserved = await customerServiceService.reserveFirstReply(
              customerServiceContext,
              remoteJid,
            );
            const isStartTrigger = [
              "menu",
              ".menu",
              "start",
              ".start",
            ].includes(incomingText);

            // First-time customer gets /welcome text only. /start is the menu.
            if (reserved && !isStartTrigger) {
              const welcomeMessage =
                await customerServiceService.getWelcomeMessage(
                  customerServiceContext,
                );
              if (!welcomeMessage) {
                logger.warn(
                  `Welcome customer service not found for bot ${activeBotId}. Skipping auto-reply.`,
                );
                await customerServiceService.releaseFirstReply(
                  customerServiceContext,
                  remoteJid,
                );
              } else {
                const welcomeStartMessage = buildWelcomeStartButtonMessage(
                  remoteJid,
                  welcomeMessage,
                );
                const sent =
                  await messageService.sendCustomerServiceRelayMessage(
                    sock,
                    message.key,
                    remoteJid,
                    welcomeStartMessage,
                  );
                if (!sent) {
                  await customerServiceService.releaseFirstReply(
                    customerServiceContext,
                    remoteJid,
                  );
                }
              }
              continue;
            }

            if (["welcome", ".welcome"].includes(incomingText)) {
              const welcomeMessage =
                await customerServiceService.getWelcomeMessage(
                  customerServiceContext,
                );
              if (welcomeMessage) {
                const welcomeStartMessage = buildWelcomeStartButtonMessage(
                  remoteJid,
                  welcomeMessage,
                );
                await messageService.sendCustomerServiceRelayMessage(
                  sock,
                  message.key,
                  remoteJid,
                  welcomeStartMessage,
                );
              }
              continue;
            }

            if (isStartTrigger) {
              const startEntry = await customerServiceService.getCommandEntry(
                customerServiceContext,
                "start",
              );
              if (startEntry) {
                let finalStartText = startEntry.value;
                let selectedMenuCommands = null;
                try {
                  const parsedObj = JSON.parse(startEntry.value);
                  if (
                    parsedObj.text !== undefined &&
                    Array.isArray(parsedObj.menuList)
                  ) {
                    finalStartText = parsedObj.text;
                    selectedMenuCommands = parsedObj.menuList;
                  }
                } catch {
                  // Plain text start message.
                }

                const allCommands = await customerServiceService.getAllCommands(
                  customerServiceContext,
                );
                const activeRows = selectedMenuCommands
                  ? selectedMenuCommands
                      .map((cmdName) =>
                        allCommands.find((c) => c.command === cmdName),
                      )
                      .filter(Boolean)
                      .map((cmd) => ({
                        title: cmd.command.toUpperCase(),
                        id: cmd.command,
                      }))
                  : allCommands.map((cmd) => ({
                      title: cmd.command.toUpperCase(),
                      id: cmd.command,
                    }));

                if (activeRows.length > 0) {
                  const listData = {
                    title: "List Menu",
                    sections: [
                      {
                        title: "Daftar Menu Tersedia",
                        rows: activeRows,
                      },
                    ],
                  };

                  try {
                    const msg = generateWAMessageFromContent(
                      remoteJid,
                      {
                        viewOnceMessage: {
                          message: {
                            messageContextInfo: {
                              deviceListMetadata: {},
                              deviceListMetadataVersion: 3,
                            },
                            interactiveMessage:
                              proto.Message.InteractiveMessage.create({
                                body: proto.Message.InteractiveMessage.Body.create(
                                  { text: finalStartText },
                                ),
                                footer:
                                  proto.Message.InteractiveMessage.Footer.create(
                                    { text: "By Wisnu Store" },
                                  ),
                                header:
                                  proto.Message.InteractiveMessage.Header.create(
                                    {
                                      title: "",
                                      subtitle: "",
                                      hasMediaAttachment: false,
                                    },
                                  ),
                                nativeFlowMessage:
                                  proto.Message.InteractiveMessage.NativeFlowMessage.create(
                                    {
                                      buttons: [
                                        {
                                          name: "single_select",
                                          buttonParamsJson:
                                            JSON.stringify(listData),
                                        },
                                        {
                                          name: "cta_url",
                                          buttonParamsJson: JSON.stringify({
                                            display_text: "Contact Owner",
                                            url: `https://wa.me/${customerServiceContext.userPhoneNumber}`,
                                          }),
                                        },
                                      ],
                                    },
                                  ),
                              }),
                          },
                        },
                      },
                      {},
                    );

                    await messageService.sendCustomerServiceRelayMessage(
                      sock,
                      message.key,
                      remoteJid,
                      msg,
                    );
                  } catch (err) {
                    logger.error(err, "Failed to send dynamic start menu");
                  }
                } else {
                  await messageService.sendCustomerServiceMessage(
                    sock,
                    message.key,
                    remoteJid,
                    finalStartText,
                  );
                }
              }
              continue;
            }

            // ==================== DYNAMIC LIST MENU ====================
            const isWelcomeCommand = [
              "menu",
              ".menu",
              "start",
              ".start",
              "welcome",
              ".welcome",
            ].includes(incomingText);

            if (reserved || isWelcomeCommand) {
              const welcomeMessage =
                await customerServiceService.getWelcomeMessage(
                  customerServiceContext,
                );

              if (!welcomeMessage && reserved) {
                logger.warn(
                  `Welcome customer service not found for bot ${activeBotId}. Skipping auto-reply.`,
                );
                await customerServiceService.releaseFirstReply(
                  customerServiceContext,
                  remoteJid,
                );
              }

              if (welcomeMessage) {
                // Parse optional JSON if user configured specific menu list in AddCustomerServicePage
                let finalWelcomeText = welcomeMessage;
                let selectedMenuCommands = null;
                try {
                  const parsedObj = JSON.parse(welcomeMessage);
                  if (
                    parsedObj.text !== undefined &&
                    Array.isArray(parsedObj.menuList)
                  ) {
                    finalWelcomeText = parsedObj.text;
                    selectedMenuCommands = parsedObj.menuList;
                  }
                } catch (e) {
                  // Legacy / text only
                }

                // Fetch all other commands to form the list menu
                const allCommands = await customerServiceService.getAllCommands(
                  customerServiceContext,
                );

                // Map the active commands based on user selection or show all
                let activeRows = [];
                if (selectedMenuCommands) {
                  // Follow the exact order configured by user
                  activeRows = selectedMenuCommands
                    .map((cmdName) =>
                      allCommands.find((c) => c.command === cmdName),
                    )
                    .filter(Boolean)
                    .map((cmd) => ({
                      title: cmd.command.toUpperCase(),
                      id: cmd.command,
                    }));
                } else {
                  // Fallback: show everything if no specific config
                  activeRows = allCommands.map((cmd) => ({
                    title: cmd.command.toUpperCase(),
                    id: cmd.command,
                  }));
                }

                if (activeRows.length > 0) {
                  // Build dynamic list data
                  const listData = {
                    title: "ʟɪsᴛ ᴍᴇɴᴜ",
                    sections: [
                      {
                        title: "Daftar Menu Tersedia",
                        rows: activeRows,
                      },
                    ],
                  };

                  try {
                    const msg = generateWAMessageFromContent(
                      remoteJid,
                      {
                        viewOnceMessage: {
                          message: {
                            messageContextInfo: {
                              deviceListMetadata: {},
                              deviceListMetadataVersion: 3,
                            },
                            interactiveMessage:
                              proto.Message.InteractiveMessage.create({
                                body: proto.Message.InteractiveMessage.Body.create(
                                  { text: finalWelcomeText },
                                ),
                                footer:
                                  proto.Message.InteractiveMessage.Footer.create(
                                    { text: "By Wisnu Store" },
                                  ),
                                header:
                                  proto.Message.InteractiveMessage.Header.create(
                                    {
                                      title: "",
                                      subtitle: "",
                                      hasMediaAttachment: false,
                                    },
                                  ),
                                nativeFlowMessage:
                                  proto.Message.InteractiveMessage.NativeFlowMessage.create(
                                    {
                                      buttons: [
                                        {
                                          name: "single_select",
                                          buttonParamsJson:
                                            JSON.stringify(listData),
                                        },
                                        {
                                          name: "cta_url",
                                          buttonParamsJson: JSON.stringify({
                                            display_text: "Contact Owner",
                                            url: `https://wa.me/${customerServiceContext.userPhoneNumber}`,
                                          }),
                                        },
                                      ],
                                    },
                                  ),
                              }),
                          },
                        },
                      },
                      {}, // options
                    );

                    const sent =
                      await messageService.sendCustomerServiceRelayMessage(
                        sock,
                        message.key,
                        remoteJid,
                        msg,
                      );
                    if (!sent && reserved) {
                      await customerServiceService.releaseFirstReply(
                        customerServiceContext,
                        remoteJid,
                      );
                    }
                  } catch (err) {
                    logger.error(err, "Failed to send dynamic menu list");
                    if (reserved) {
                      await customerServiceService.releaseFirstReply(
                        customerServiceContext,
                        remoteJid,
                      );
                    }
                  }
                } else {
                  // Fallback to purely text if no commands are available
                  const sent = await messageService.sendCustomerServiceMessage(
                    sock,
                    message.key,
                    remoteJid,
                    finalWelcomeText,
                  );
                  if (!sent && reserved) {
                    await customerServiceService.releaseFirstReply(
                      customerServiceContext,
                      remoteJid,
                    );
                  }
                }
              }

              // Skip further processing for welcome triggers
              continue;
            }
            // ================================================================

            if (!incomingText) {
              continue;
            }

            const commandEntry = await customerServiceService.getCommandEntry(
              customerServiceContext,
              incomingText,
            );
            if (!commandEntry) {
              continue;
            }

            const interactiveMessage = buildCommandInteractiveMessage(
              remoteJid,
              commandEntry,
            );
            if (interactiveMessage) {
              await messageService.sendCustomerServiceRelayMessage(
                sock,
                message.key,
                remoteJid,
                interactiveMessage,
              );
            } else {
              await messageService.sendCustomerServiceMessage(
                sock,
                null,
                remoteJid,
                commandEntry.value,
              );
            }
          }
        } catch (err) {
          logger.error(
            err,
            `Customer service auto welcome error for bot ${botId}`,
          );
        }
      });

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.lastQr.set(userId, qr);
          logger.info(`QR generated for user ${userId}`);
          if (this.io) {
            this.io.to(`user_${userId}`).emit("qr", { qr });
          }
        }

        if (connection === "open") {
          logger.info(`Bot connected for user ${userId}`);
          this.clearReconnectState(key);
          this.connectingBots.delete(key);
          // Mark when this connection became ready so we can ignore older
          // offline/backlog messages on reconnect.
          const readyAt = Math.floor(Date.now() / 1000);
          this.connectionReadyAt.set(key, readyAt);
          if (runtimeBotId && runtimeBotId !== key) {
            this.connectionReadyAt.set(runtimeBotId, readyAt);
          }
          const scannedPhoneNumberRaw = sock.user?.id?.split(":")[0] || "";
          const scannedPhoneNumber = this.normalizeWhatsappPhoneNumber(
            scannedPhoneNumberRaw,
          );
          const expectedNumber = this.expectedPhoneNumbers.get(key) || "";

          if (expectedNumber && scannedPhoneNumber !== expectedNumber) {
            logger.warn(
              `Pairing rejected for user ${userId}, bot ${botId}: expected ${expectedNumber}, got ${scannedPhoneNumber}`,
            );

            this.mismatchDisconnectPayloads.set(key, {
              reason: "phone_mismatch",
              botId,
              expectedPhoneNumber: expectedNumber,
              scannedPhoneNumber,
            });
            this.manualDisconnectBots.add(key);
            this.expectedPhoneNumbers.delete(key);
            this.lastQr.delete(userId);

            try {
              await sock.logout();
            } catch {
              // Ignore logout errors
            }

            sock.end();
            this.connections.delete(key);
            this.removeSessionDirectory(sessionName);
            return;
          }

          const phoneNumber =
            scannedPhoneNumber || scannedPhoneNumberRaw || "unknown";
          let activeBotId = key;
          if (isPendingPairing && options.persistOnConnect) {
            const pendingData = this.pendingConnections.get(sessionName);
            activeBotId = await this.persistConnectedBot(
              userId,
              sessionName,
              phoneNumber,
              pendingData?.ownerPhoneNumber || null,
              pendingData?.botPurpose || "main",
            );
            this.promoteConnection(key, activeBotId);
            this.pendingConnections.delete(sessionName);
          } else {
            const pool = getPool();
            await pool.execute(
              "UPDATE bots SET is_online = 1, phone_number = ? WHERE id = ?",
              [phoneNumber, activeBotId],
            );
          }
          runtimeBotId = activeBotId;
          const activeConnectionAfterPersist = this.connections.get(activeBotId);
          const activeBotPurpose = activeConnectionAfterPersist?.botPurpose || "main";
          if (activeBotId !== key) {
            this.connectionReadyAt.set(activeBotId, readyAt);
          }

          if (activeBotPurpose === "main") {
            await customerServiceService.ensureDefaultWelcomeForBot(activeBotId);
          }

          this.expectedPhoneNumbers.delete(key);
          if (activeBotId !== key) {
            this.expectedPhoneNumbers.delete(activeBotId);
          }
          this.lastQr.delete(userId);

          if (this.io) {
            this.io
              .to(`user_${userId}`)
              .emit("connected", { phone: phoneNumber, botId: activeBotId });
          }

          // Sinkronisasi grup berjalan di background agar tidak membebani load awal
          this.syncGroupsToDatabase(userId, activeBotId, sock).catch((err) => {
            logger.error(err, `Gagal sinkronisasi grup untuk user ${userId}`);
          });

          const pool = getPool();
          await pool.execute(
            "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
            [
              userId,
              "bot_connected",
              `Bot ${activeBotPurpose === "push_contact" ? "push kontak" : "utama"} terhubung: ${phoneNumber}`,
            ],
          );
        }

        if (connection === "close") {
          const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
          const errorMessage = String(lastDisconnect?.error?.message || "");
          const isQrAttemptsEnded = /QR refs attempts ended/i.test(
            errorMessage,
          );
          const isConflictDisconnect =
            reason === 440 || /conflict|replaced/i.test(errorMessage);
          const isRestartRequired =
            reason === DisconnectReason.restartRequired || reason === 515;
          const isManualDisconnect = this.manualDisconnectBots.has(key);

          this.connectingBots.delete(key);
          this.connections.delete(key);
          let disconnectPhoneNumber = "";
          if (!isPendingPairing) {
            const pool = getPool();
            const [botRows] = await pool.execute(
              "SELECT phone_number FROM bots WHERE id = ? LIMIT 1",
              [botId],
            );
            disconnectPhoneNumber = String(botRows[0]?.phone_number ?? "");
            await pool.execute("UPDATE bots SET is_online = 0 WHERE id = ?", [
              botId,
            ]);
          }

          logger.warn(`Bot disconnected for user ${userId}, reason: ${reason}`);

          if (!isRestartRequired) {
            const pool = getPool();
            await pool.execute(
              "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
              [
                userId,
                "bot_disconnected",
                `Bot disconnect: ${disconnectPhoneNumber || sessionName || botId}`,
              ],
            );
          }

          if (isManualDisconnect) {
            logger.info(
              `Manual disconnect acknowledged for user ${userId}, bot ${botId}`,
            );
            this.manualDisconnectBots.delete(key);
            this.clearReconnectState(key);
            this.lastQr.delete(userId);
            const mismatchPayload =
              this.mismatchDisconnectPayloads.get(key) || null;
            if (mismatchPayload) {
              this.mismatchDisconnectPayloads.delete(key);
              await this.deleteBotRecord(botId, sessionName);
            }
            this.expectedPhoneNumbers.delete(key);
            if (isPendingPairing) {
              this.pendingConnections.delete(sessionName);
            }

            if (this.io) {
              this.io
                .to(`user_${userId}`)
                .emit(
                  "disconnected",
                  mismatchPayload || { reason: "manual", botId },
                );
            }
            return;
          }

          if (isRestartRequired) {
            logger.info(
              `Restart required for user ${userId}, bot ${botId}. Reconnecting with existing session...`,
            );
            this.lastQr.delete(userId);
            this.clearReconnectState(key);

            setTimeout(() => {
              this.connect(userId, botId, sessionName, {
                persistOnConnect: options.persistOnConnect === true,
                usePairingCode: false,
                ...(expectedPhoneNumber ? { expectedPhoneNumber } : {}),
              }).catch((err) => {
                logger.error(
                  err,
                  `Restart reconnect failed for user ${userId}, bot ${botId}`,
                );
              });
            }, 1_000);
            return;
          }

          if (isConflictDisconnect) {
            logger.warn(
              `Bot session conflict for user ${userId}, bot ${botId}. Keeping bot record and session.`,
            );
            this.lastQr.delete(userId);
            this.clearReconnectState(key);
            this.expectedPhoneNumbers.delete(key);

            if (this.io) {
              this.io.to(`user_${userId}`).emit("disconnected", {
                reason: "conflict",
                botId,
              });
            }
            return;
          }

          if (reason === DisconnectReason.loggedOut) {
            logger.info(`Bot logged out for user ${userId}`);
            this.lastQr.delete(userId);
            await this.deleteBotRecord(botId, sessionName);
            if (isPendingPairing) {
              this.pendingConnections.delete(sessionName);
            }

            if (this.io) {
              this.io
                .to(`user_${userId}`)
                .emit("disconnected", { reason: "logged_out" });
            }
          } else if (isQrAttemptsEnded) {
            logger.warn(
              `QR pairing timed out for user ${userId}, bot ${botId}. Removing session and database record.`,
            );
            this.lastQr.delete(userId);
            await this.deleteBotRecord(botId, sessionName);
            if (isPendingPairing) {
              this.pendingConnections.delete(sessionName);
            }

            if (this.io) {
              this.io.to(`user_${userId}`).emit("disconnected", {
                reason: "qr_timeout",
                botId,
              });
            }
          } else {
            logger.warn(
              `Bot offline for user ${userId}, bot ${botId}. Keeping bot record and session for reconnect.`,
            );
            this.lastQr.delete(userId);
            if (isPendingPairing) {
              this.pendingConnections.delete(sessionName);
            } else {
              await this.scheduleReconnect(userId, botId, sessionName, reason);
            }

            if (this.io) {
              this.io.to(`user_${userId}`).emit("disconnected", {
                reason: "offline_reconnecting",
                botId,
              });
            }
          }
        }
      });

      sock.ev.on("creds.update", saveCreds);

      return sock;
    } catch (err) {
      this.connectingBots.delete(key);
      this.connections.delete(key);
      logger.error(
        err,
        `Failed to initialize bot connection for user ${userId}, bot ${botId}`,
      );
      throw err;
    }
  }

  async disconnect(userId, sessionName) {
    const matches = [...this.connections.entries()].filter(([, conn]) => {
      if (sessionName) {
        return conn.sessionName === sessionName;
      }
      return Number(conn.userId) === Number(userId);
    });

    for (const [botId, conn] of matches) {
      this.manualDisconnectBots.add(Number(botId));
      this.clearReconnectState(botId);
      this.expectedPhoneNumbers.delete(Number(botId));
      this.mismatchDisconnectPayloads.delete(Number(botId));
      try {
        await conn.sock.logout();
      } catch {
        // Ignore logout errors
      }
      conn.sock.end();
      this.connections.delete(botId);
    }

    if (matches.length > 0) {
      this.lastQr.delete(Number(userId));
    }
  }

  removeSessionDirectory(sessionName) {
    if (!sessionName) {
      return;
    }

    const sessionDir = join(config.sessionDir, sessionName);
    try {
      rmSync(sessionDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 200,
      });
      logger.info(`Session directory removed: ${sessionName}`);
    } catch (err) {
      if (err?.code === "ENOENT") {
        return;
      }
      logger.warn(err, `Failed to remove session directory: ${sessionName}`);
    }
  }

  async reconnectAll() {
    try {
      const pool = getPool();
      const [bots] = await pool.execute(
        "SELECT b.id, b.user_id, b.session_name, b.bot_purpose FROM bots b WHERE b.is_online = 1",
      );

      for (const bot of bots) {
        logger.info(`Auto-reconnecting bot: ${bot.session_name}`);
        this.expectedPhoneNumbers.delete(Number(bot.id));
        await this.connect(bot.user_id, bot.id, bot.session_name, {
          botPurpose: bot.bot_purpose || "main",
        });
      }
    } catch (err) {
      logger.error(err, "Reconnect all error");
    }
  }
}

export const baileysManager = new BaileysManager();
