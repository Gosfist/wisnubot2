import { logger } from "../utils/logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MESSAGE_DELAY_MIN_MS = 60 * 1000;
const MESSAGE_DELAY_MAX_MS = 130 * 1000;
const INCOMING_MESSAGE_READ_DELAY_MS = 1000;
const CUSTOMER_SERVICE_REPLY_DELAY_MIN_MS = 1000;
const CUSTOMER_SERVICE_REPLY_DELAY_MAX_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomMessageDelayMs() {
  return (
    Math.floor(Math.random() * (MESSAGE_DELAY_MAX_MS - MESSAGE_DELAY_MIN_MS + 1)) +
    MESSAGE_DELAY_MIN_MS
  );
}

function getRandomCustomerServiceReplyDelayMs() {
  return (
    Math.floor(
      Math.random() *
        (CUSTOMER_SERVICE_REPLY_DELAY_MAX_MS -
          CUSTOMER_SERVICE_REPLY_DELAY_MIN_MS +
          1),
    ) + CUSTOMER_SERVICE_REPLY_DELAY_MIN_MS
  );
}

/**
 * Message service with anti-ban queue
 * - Random delay between messages (60-130 seconds)
 * - Max 10 messages per 5 minutes per bot
 */
class MessageService {
  constructor() {
    // Track message counts per userId for rate limiting
    this.messageCounts = new Map(); // userId -> { count, resetAt }
  }

  checkRateLimit(userId) {
    const now = Date.now();
    let record = this.messageCounts.get(userId);

    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + 5 * 60 * 1000 }; // 5 minute window
      this.messageCounts.set(userId, record);
    }

    if (record.count >= 10) {
      return false;
    }

    record.count++;
    return true;
  }

  async sendMessage(sock, jid, text, imageUrlRelative = null) {
    try {
      if (imageUrlRelative) {
        // Build absolute path from relative web path like /uploads/broadcasts/xxx.jpg
        const absPath = path.join(__dirname, "../../", imageUrlRelative.replace(/^\//, ""));
        if (fs.existsSync(absPath)) {
          const imageData = fs.readFileSync(absPath);
          await sock.sendMessage(jid, { image: imageData, caption: text });
        } else {
          // Image file missing, fall back to text only
          logger.warn(`Broadcast image not found: ${absPath}, sending text only`);
          await sock.sendMessage(jid, { text });
        }
      } else {
        await sock.sendMessage(jid, { text });
      }
      logger.info(`Message sent to ${jid}`);
      return true;
    } catch (err) {
      logger.error(err, `Failed to send message to ${jid}`);
      return false;
    }
  }

  async markIncomingMessageAsRead(sock, messageKey, jid) {
    if (!messageKey) {
      return false;
    }

    await sleep(INCOMING_MESSAGE_READ_DELAY_MS);

    try {
      await sock.readMessages([messageKey]);
      logger.info(`Incoming message marked as read for ${jid}`);
      return true;
    } catch (err) {
      logger.warn(err, `Failed to mark message as read for ${jid}`);
      return false;
    }
  }

  async sendCustomerServiceMessage(sock, messageKey, jid, text) {
    const replyDelayMs = getRandomCustomerServiceReplyDelayMs();
    await this.markIncomingMessageAsRead(sock, messageKey, jid);

    try {
      await sock.sendPresenceUpdate("composing", jid);
    } catch (err) {
      logger.warn(err, `Failed to send composing presence for ${jid}`);
    }

    await sleep(replyDelayMs);

    try {
      await sock.sendMessage(jid, { text });
      logger.info(`Customer service message sent to ${jid}`);
      return true;
    } catch (err) {
      logger.error(err, `Failed to send customer service message to ${jid}`);
      return false;
    } finally {
      try {
        await sock.sendPresenceUpdate("paused", jid);
      } catch (err) {
        logger.warn(err, `Failed to send paused presence for ${jid}`);
      }
    }
  }

  async sendCustomerServiceRelayMessage(sock, messageKey, jid, msg) {
    const replyDelayMs = getRandomCustomerServiceReplyDelayMs();
    await this.markIncomingMessageAsRead(sock, messageKey, jid);

    try {
      await sock.sendPresenceUpdate("composing", jid);
    } catch (err) {
      logger.warn(err, `Failed to send composing presence for ${jid}`);
    }

    await sleep(replyDelayMs);

    try {
      await sock.relayMessage(msg.key.remoteJid, msg.message, {
        messageId: msg.key.id
      });
      logger.info(`Customer service relay message sent to ${jid}`);
      return true;
    } catch (err) {
      logger.error(err, `Failed to send customer service relay message to ${jid}`);
      return false;
    } finally {
      try {
        await sock.sendPresenceUpdate("paused", jid);
      } catch (err) {
        logger.warn(err, `Failed to send paused presence for ${jid}`);
      }
    }
  }

  async sendBulkMessages(sock, userId, groupJids, text, imageUrl = null) {
    const results = [];

    for (const [index, jid] of groupJids.entries()) {
      if (!this.checkRateLimit(userId)) {
        logger.warn(`Rate limit reached for user ${userId}`);
        results.push({ jid, status: "rate_limited" });
        break;
      }

      const success = await this.sendMessage(sock, jid, text, imageUrl);
      results.push({ jid, status: success ? "sent" : "failed" });

      // Anti-ban: randomize the gap so the send pattern is less predictable.
      if (index < groupJids.length - 1) {
        const delayMs = getRandomMessageDelayMs();
        logger.info(`Anti-ban delay: ${Math.round(delayMs / 1000)}s`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }
}

export const messageService = new MessageService();
