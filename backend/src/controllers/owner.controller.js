import { getPool } from "../config/database.js";
import { resolveBroadcastTable } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";
import { ownerBotService } from "../services/owner-bot.service.js";

export async function getAdminStats(req, res) {
  try {
    const pool = getPool();
    const broadcastTable = resolveBroadcastTable();

    const [[{ totalBots }]] = await pool.execute(
      'SELECT COUNT(*) as totalBots FROM bots WHERE is_online = 1',
    );
    const [[{ totalBroadcasts }]] = await pool.execute(
      `SELECT COUNT(*) as totalBroadcasts FROM ${broadcastTable} WHERE is_active = 1`,
    );

    res.json({
      stats: {
        totalBots,
        totalBroadcasts,
      },
    });
  } catch (err) {
    logger.error(err, "Get admin stats error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function testBroadcastBot(req, res) {
  try {
    const pool = getPool();
    const connection = await ownerBotService.getBroadcastBotConnection();

    if (!connection) {
      const configuredBot = await ownerBotService.findBroadcastBot();
      return res.status(configuredBot ? 400 : 404).json({
        error: configuredBot
          ? "Bot broadcast owner belum online"
          : "Bot broadcast owner belum dikonfigurasi",
      });
    }

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [
        req.user.id,
        "admin_test_broadcast_bot",
        `Test broadcast via bot ${connection.phoneNumber}`,
      ],
    );

    res.json({
      message: `Bot ${connection.phoneNumber} berhasil diuji (online)`,
    });
  } catch (err) {
    logger.error(err, "Test broadcast bot error");
    res.status(500).json({ error: "Server error" });
  }
}
