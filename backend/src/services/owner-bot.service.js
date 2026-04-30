import { getPool } from "../config/database.js";
import { baileysManager } from "./baileys.service.js";

async function findBotInternal({ requireOnline = false } = {}) {
  const pool = getPool();
  const clauses = [];

  if (requireOnline) {
    clauses.push("b.is_online = 1");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const [bots] = await pool.execute(
    `SELECT b.id, b.user_id, b.phone_number, b.is_online
     FROM bots b
     ${where}
     ORDER BY b.created_at DESC
     LIMIT 1`,
  );

  return bots[0] ?? null;
}

async function getBotConnection() {
  const bot = await findBotInternal({ requireOnline: true });
  if (!bot) return null;

  const sock = baileysManager.getSocketForBot(bot.id);
  if (!sock) return null;

  return {
    botId: Number(bot.id),
    userId: Number(bot.user_id),
    phoneNumber: bot.phone_number || null,
    sock,
  };
}

export const ownerBotService = {
  findBroadcastBot(options) {
    return findBotInternal(options);
  },
  getBroadcastBotConnection() {
    return getBotConnection();
  },
};
