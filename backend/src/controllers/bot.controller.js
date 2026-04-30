import { getPool } from "../config/database.js";
import { baileysManager } from "../services/baileys.service.js";
import { resolveBroadcastTable } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";

function normalizeWhatsappPhoneNumber(rawValue) {
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


export async function getBotStatus(req, res) {
  try {
    const pool = getPool();
    const broadcastTable = resolveBroadcastTable();

    const [bots] = await pool.execute(
      `SELECT
        b.id,
        b.user_id,
        b.session_name,
        b.phone_number,
        b.is_online,
        b.expired_at,
        b.created_at,
        COUNT(DISTINCT CASE WHEN g.is_active = 1 THEN g.id END) AS group_count,
        (
          SELECT COUNT(*)
          FROM ${broadcastTable} bcast
          WHERE bcast.user_id = b.user_id AND bcast.is_active = 1
        ) AS active_broadcast_count
      FROM bots b
      LEFT JOIN \`groups\` g ON g.bot_id = b.id
      WHERE b.user_id = ?
        AND (b.phone_number IS NOT NULL OR b.is_online = 1)
      GROUP BY b.id, b.user_id, b.session_name, b.phone_number, b.is_online, b.expired_at, b.created_at
      ORDER BY b.created_at DESC`,
      [req.user.id],
    );

    const mappedBots = bots.map((bot) => {
      const isConnected = !!baileysManager.getSocketForBot(bot.id);
      return {
        id: Number(bot.id),
        session_name: bot.session_name,
        phone_number: bot.phone_number ?? "-",
        status: isConnected ? "online" : "offline",
        expired_at: bot.expired_at,
        group_count: Number(bot.group_count || 0),
        active_broadcast_count: Number(bot.active_broadcast_count || 0),
      };
    });

    const offlineBots = mappedBots.filter((bot) => bot.status === "offline");
    if (offlineBots.length > 0) {
      await Promise.all(
        offlineBots.map((bot) =>
          baileysManager.deleteBotRecord(bot.id, bot.session_name),
        ),
      );
    }

    res.json({
      bots: mappedBots
        .filter((bot) => bot.status === "online")
        .map(({ session_name, ...bot }) => bot),
    });
  } catch (err) {
    logger.error(err, "Get bot status error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function connectBot(req, res) {
  try {
    const pool = getPool();
    const userId = req.user.id;
    const phoneNumberInput = String(req.body?.phoneNumber ?? "");
    const normalizedPhoneNumber = normalizeWhatsappPhoneNumber(phoneNumberInput);
    const ownerPhoneNumberInput = String(req.body?.ownerPhoneNumber ?? "");
    const normalizedOwnerPhoneNumber = normalizeWhatsappPhoneNumber(ownerPhoneNumberInput);
    const pairingMethod = String(req.body?.pairingMethod ?? "").trim().toLowerCase();
    const usePairingCode = pairingMethod === "code";

    if (usePairingCode && !normalizedPhoneNumber) {
      return res.status(400).json({
        error: "Nomor WhatsApp wajib diisi untuk pairing code",
      });
    }

    if (normalizedPhoneNumber) {
      const [existingBots] = await pool.execute(
        `SELECT id, is_online FROM bots WHERE phone_number = ? ORDER BY is_online DESC, created_at DESC LIMIT 1`,
        [normalizedPhoneNumber],
      );

      const existingBot = existingBots[0] ?? null;
      if (existingBot && Number(existingBot.is_online) === 1) {
        return res.status(409).json({
          error:
            "Nomor ini masih terhubung sebagai bot aktif. Hapus atau putuskan bot lama dulu sebelum membuat pairing code baru.",
        });
      }
    }

    const pendingPairing = await baileysManager.startPendingPairing(userId, {
      usePairingCode,
      ...(normalizedPhoneNumber ? { expectedPhoneNumber: normalizedPhoneNumber } : {}),
      ...(normalizedOwnerPhoneNumber ? { ownerPhoneNumber: normalizedOwnerPhoneNumber } : {}),
    });

    res.json({
      message: "Memulai pairing bot dengan pairing code",
      sessionName: pendingPairing.sessionName,
      pending: true,
      pairingCode: pendingPairing.pairingCode,
    });
  } catch (err) {
    logger.error(err, "Connect bot error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function testUserBot(req, res) {
  try {
    const pool = getPool();
    const userId = req.user.id;

    const [bots] = await pool.execute(
      "SELECT id, phone_number FROM bots WHERE user_id = ? AND is_online = 1 ORDER BY created_at DESC LIMIT 1",
      [userId],
    );

    if (bots.length === 0) {
      return res.status(404).json({ error: "Bot belum terhubung atau sedang offline" });
    }

    const bot = bots[0];
    const sock = baileysManager.getSocketForBot(bot.id);
    if (!sock) {
      return res.status(400).json({ error: "Bot sedang offline, coba lagi nanti" });
    }

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [userId, "test_bot", `Test bot via ${bot.phone_number}`],
    );

    res.json({ message: `Bot ${bot.phone_number} sedang online dan siap digunakan` });
  } catch (err) {
    logger.error(err, "Test bot error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function cancelPendingBotPairing(req, res) {
  try {
    const sessionName = String(req.body?.sessionName ?? "").trim();
    if (!sessionName) {
      return res.status(400).json({ error: "sessionName wajib diisi" });
    }

    await baileysManager.cancelPendingPairing(req.user.id, sessionName);
    res.json({ message: "Pending pairing dibersihkan" });
  } catch (err) {
    logger.error(err, "Cancel pending bot pairing error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function disconnectBot(req, res) {
  try {
    const { botId } = req.params;
    const pool = getPool();

    const [bots] = await pool.execute(
      "SELECT id, session_name FROM bots WHERE id = ? AND user_id = ?",
      [botId, req.user.id],
    );

    if (bots.length === 0) {
      return res.status(404).json({ error: "Bot tidak ditemukan" });
    }

    const bot = bots[0];
    await baileysManager.disconnect(req.user.id, bot.session_name);

    // Ensure legacy schemas without FK cascade also get cleaned up
    await pool.execute("DELETE FROM `groups` WHERE bot_id = ?", [bot.id]);

    const [deleteResult] = await pool.execute(
      "DELETE FROM bots WHERE id = ? AND user_id = ?",
      [bot.id, req.user.id],
    );

    if (Number(deleteResult?.affectedRows || 0) === 0) {
      return res.status(409).json({ error: "Bot gagal dihapus dari database" });
    }

    baileysManager.removeSessionDirectory(bot.session_name);

    res.json({ message: "Bot berhasil dihapus" });
  } catch (err) {
    logger.error(err, "Disconnect bot error");
    res.status(500).json({ error: "Server error" });
  }
}
