import { getPool } from "../config/database.js";
import { baileysManager } from "../services/baileys.service.js";
import { pushContactService } from "../services/push-contact.service.js";
import { logger } from "../utils/logger.js";

function extractInviteCode(inviteLink = "") {
  const value = inviteLink.trim();
  const match = value.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : value;
}

async function getPrimaryBot(pool, userId) {
  const [bots] = await pool.execute(
    `SELECT id, session_name
     FROM bots
     WHERE user_id = ? AND is_online = 1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );

  return bots[0] ?? null;
}

export async function listGroups(req, res) {
  try {
    const pool = getPool();
    const [groups] = await pool.execute(
      `SELECT g.* FROM \`groups\` g
       JOIN bots b ON g.bot_id = b.id
       WHERE b.user_id = ?
       ORDER BY g.joined_at DESC`,
      [req.user.id],
    );

    res.json({ groups });
  } catch (err) {
    logger.error(err, "List groups error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function joinGroup(req, res) {
  try {
    const pool = getPool();
    const userId = req.user.id;
    const inviteCode = extractInviteCode(req.body.inviteLink);

    if (!inviteCode) {
      return res.status(400).json({ error: "Link undangan group tidak valid" });
    }

    const bot = await getPrimaryBot(pool, userId);
    if (!bot) {
      return res.status(400).json({
        error:
          req.user.role === "owner"
            ? "Bot broadcast owner harus online untuk join group"
            : "Tidak ada bot yang online",
      });
    }

    const sock = baileysManager.getSocketForBot(bot.id);
    if (!sock) {
      return res.status(400).json({ error: "Bot socket tidak tersedia" });
    }

    const groupJid = await sock.groupAcceptInvite(inviteCode);
    const metadata = await sock.groupMetadata(groupJid);
    const memberCount = metadata.participants?.length || 0;

    const [existing] = await pool.execute(
      "SELECT id FROM `groups` WHERE bot_id = ? AND group_jid = ?",
      [bot.id, groupJid],
    );
    let groupId;
    if (existing.length === 0) {
      const [result] = await pool.execute(
        "INSERT INTO `groups` (bot_id, group_jid, name, member_count, is_active) VALUES (?, ?, ?, ?, ?)",
        [bot.id, groupJid, metadata.subject || "Unknown Group", memberCount, 0],
      );
      groupId = result.insertId;
    } else {
      groupId = existing[0].id;
      await pool.execute(
        "UPDATE `groups` SET name = ?, member_count = ? WHERE id = ?",
        [metadata.subject || "Unknown Group", memberCount, groupId],
      );
    }

    logger.info(`Bot user ${userId} joined group ${groupJid}`);
    res.json({
      message: "Bot berhasil join group",
      group: {
        id: groupId,
        group_jid: groupJid,
        name: metadata.subject || "Unknown Group",
        member_count: memberCount,
        is_active: false,
      },
    });
  } catch (err) {
    logger.error(err, "Join group error");
    res.status(500).json({ error: "Gagal join group. Pastikan link undangan masih valid." });
  }
}

export async function syncGroups(req, res) {
  try {
    const pool = getPool();
    const userId = req.user.id;
    const bot = await getPrimaryBot(pool, userId);

    if (!bot) {
      return res.status(400).json({
        error:
          req.user.role === "owner"
            ? "Bot broadcast owner harus online untuk sync group"
            : "Tidak ada bot yang online",
      });
    }

    const sock = baileysManager.getSocketForBot(bot.id);
    if (!sock) {
      return res.status(400).json({ error: "Bot socket tidak tersedia" });
    }

    const waGroups = await sock.groupFetchAllParticipating();
    const groupEntries = Object.values(waGroups);

    let synced = 0;
    for (const g of groupEntries) {
      const [existing] = await pool.execute(
        "SELECT id FROM `groups` WHERE bot_id = ? AND group_jid = ?",
        [bot.id, g.id],
      );

      if (existing.length === 0) {
        await pool.execute(
          "INSERT INTO `groups` (bot_id, group_jid, name, member_count, is_active) VALUES (?, ?, ?, ?, ?)",
          [bot.id, g.id, g.subject, g.participants?.length || 0, 0],
        );
        synced += 1;
      } else {
        await pool.execute(
          "UPDATE `groups` SET name = ?, member_count = ? WHERE id = ?",
          [g.subject, g.participants?.length || 0, existing[0].id],
        );
      }
    }

    logger.info(`Synced ${synced} new groups for user ${userId}`);
    res.json({ message: `Berhasil sync ${groupEntries.length} group (${synced} baru)` });
  } catch (err) {
    logger.error(err, "Sync groups error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function toggleGroup(req, res) {
  try {
    const { groupId } = req.params;
    const pool = getPool();

    const [groups] = await pool.execute(
      `SELECT g.id, g.is_active FROM \`groups\` g
       JOIN bots b ON g.bot_id = b.id
       WHERE g.id = ? AND b.user_id = ?`,
      [groupId, req.user.id],
    );

    if (groups.length === 0) {
      return res.status(404).json({ error: "Group tidak ditemukan" });
    }

    const newStatus = groups[0].is_active ? 0 : 1;
    await pool.execute("UPDATE `groups` SET is_active = ? WHERE id = ?", [newStatus, groupId]);

    res.json({ message: `Group ${newStatus ? "diaktifkan" : "dinonaktifkan"}`, is_active: !!newStatus });
  } catch (err) {
    logger.error(err, "Toggle group error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function deleteGroup(req, res) {
  try {
    const { groupId } = req.params;
    const pool = getPool();

    const [groups] = await pool.execute(
      `SELECT g.id, g.group_jid, g.name, g.bot_id FROM \`groups\` g
       JOIN bots b ON g.bot_id = b.id
       WHERE g.id = ? AND b.user_id = ?`,
      [groupId, req.user.id],
    );

    if (groups.length === 0) {
      return res.status(404).json({ error: "Group tidak ditemukan" });
    }

    const group = groups[0];
    const sock = baileysManager.getSocketForBot(group.bot_id);

    if (!sock) {
      return res.status(400).json({ error: "Bot harus online untuk keluar dari group" });
    }

    await sock.groupLeave(group.group_jid);
    await pool.execute("DELETE FROM `groups` WHERE id = ?", [groupId]);

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [req.user.id, "leave_group", `Keluar dari group: ${group.name}`],
    );

    res.json({ message: `Berhasil keluar dari group ${group.name}` });
  } catch (err) {
    logger.error(err, "Delete group error");
    res.status(500).json({ error: "Gagal keluar dari group" });
  }
}

export async function listPushExclusions(req, res) {
  try {
    const items = await pushContactService.listExclusions(req.user, req.params.groupId);
    res.json({ items });
  } catch (err) {
    logger.error(err, "List push exclusions error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Request tidak valid" });
  }
}

export async function listPushMembers(req, res) {
  try {
    const items = await pushContactService.listMembers(req.user, req.params.groupId);
    res.json({ items });
  } catch (err) {
    logger.error(err, "List push members error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Request tidak valid" });
  }
}

export async function addPushExclusion(req, res) {
  try {
    const item = await pushContactService.addExclusion(req.user, req.params.groupId, req.body);
    res.json({ message: "Pengecualian berhasil disimpan", item });
  } catch (err) {
    logger.error(err, "Add push exclusion error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Request tidak valid" });
  }
}

export async function deletePushExclusion(req, res) {
  try {
    const ok = await pushContactService.deleteExclusion(
      req.user,
      req.params.groupId,
      req.params.exclusionId,
    );
    if (!ok) return res.status(404).json({ error: "Pengecualian tidak ditemukan" });
    res.json({ message: "Pengecualian dihapus" });
  } catch (err) {
    logger.error(err, "Delete push exclusion error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Request tidak valid" });
  }
}
