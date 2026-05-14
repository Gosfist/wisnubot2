import { getPool } from "../config/database.js";
import { baileysManager } from "./baileys.service.js";
import { logger } from "../utils/logger.js";

const PUSH_DELAY_MIN_MS = 30 * 1000;
const PUSH_DELAY_MAX_MS = 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs() {
  return (
    Math.floor(Math.random() * (PUSH_DELAY_MAX_MS - PUSH_DELAY_MIN_MS + 1)) +
    PUSH_DELAY_MIN_MS
  );
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

function jidDigits(jid) {
  return String(jid ?? "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function phoneToWhatsappJid(value) {
  const phoneNumber = normalizePhone(value);
  return phoneNumber ? `${phoneNumber}@s.whatsapp.net` : "";
}

function isLidJid(value) {
  return String(value ?? "").includes("@lid");
}

function phoneFromCandidate(value) {
  if (!value || isLidJid(value)) return "";
  const normalized = normalizePhone(jidDigits(value));
  return /^62\d{8,15}$/.test(normalized) ? normalized : "";
}

function getParticipantPhoneNumber(participant) {
  const candidates = [
    participant?.phoneNumber,
    participant?.phone_number,
    participant?.jid,
    participant?.pn,
    participant?.id,
  ];
  for (const candidate of candidates) {
    const phoneNumber = phoneFromCandidate(candidate);
    if (phoneNumber) return phoneNumber;
  }
  return "";
}

function getParticipantTargetJid(participant) {
  const phoneNumber = getParticipantPhoneNumber(participant);
  if (phoneNumber) return `${phoneNumber}@s.whatsapp.net`;
  return String(participant?.jid ?? participant?.id ?? "");
}

function isGroupAdmin(participant) {
  return Boolean(participant?.admin);
}

function mapTemplate(row) {
  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    messageText: String(row.message_text ?? ""),
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function mapExclusion(row) {
  return {
    id: Number(row.id),
    groupId: Number(row.group_id),
    phoneNumber: String(row.phone_number ?? ""),
    label: row.label ? String(row.label) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}

function mapRun(row) {
  return {
    id: Number(row.id),
    status: String(row.status ?? ""),
    totalTargets: Number(row.total_targets ?? 0),
    successCount: Number(row.success_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  };
}

function mapParticipant(participant, exclusionsByPhone, botNumber) {
  const phoneNumber = getParticipantPhoneNumber(participant);
  const exclusion = phoneNumber ? exclusionsByPhone.get(phoneNumber) : null;
  const displayNameRaw =
    participant.notify ??
    participant.name ??
    participant.verifiedName ??
    participant.pushName ??
    "";
  const displayName = String(displayNameRaw || phoneNumber || "Nomor tidak tersedia");

  return {
    jid: String(participant.id ?? ""),
    phoneNumber,
    displayName,
    isAdmin: isGroupAdmin(participant),
    isBot: Boolean(phoneNumber && phoneNumber === botNumber),
    isExcluded: Boolean(exclusion),
    exclusionId: exclusion ? Number(exclusion.id) : null,
    exclusionLabel: exclusion?.label ? String(exclusion.label) : null,
  };
}

async function getRunningRun(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, status, total_targets, success_count, failed_count, started_at, finished_at
       FROM push_contact_runs
      WHERE user_id = ? AND status = 'running'
      ORDER BY started_at DESC
      LIMIT 1`,
    [Number(user.id)],
  );
  return rows[0] ? mapRun(rows[0]) : null;
}

async function getStatus(user) {
  const running = await getRunningRun(user);
  return {
    isRunning: Boolean(running),
    running,
  };
}

async function listTemplates(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, title, message_text, created_at, updated_at
       FROM push_contact_templates
      WHERE user_id = ?
      ORDER BY created_at DESC`,
    [Number(user.id)],
  );
  return rows.map(mapTemplate);
}

async function createTemplate(user, payload) {
  const title = String(payload.title ?? "").trim();
  const messageText = String(payload.messageText ?? payload.message_text ?? "").trim();
  if (!title) throw new Error("Nama template wajib diisi");
  if (!messageText) throw new Error("Text template wajib diisi");

  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO push_contact_templates (user_id, title, message_text)
     VALUES (?, ?, ?)`,
    [Number(user.id), title, messageText],
  );
  return {
    id: Number(result.insertId ?? 0),
    title,
    messageText,
    createdAt: null,
    updatedAt: null,
  };
}

async function updateTemplate(user, templateId, payload) {
  const title = String(payload.title ?? "").trim();
  const messageText = String(payload.messageText ?? payload.message_text ?? "").trim();
  if (!title) throw new Error("Nama template wajib diisi");
  if (!messageText) throw new Error("Text template wajib diisi");

  const pool = getPool();
  const [result] = await pool.execute(
    `UPDATE push_contact_templates
        SET title = ?, message_text = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    [title, messageText, Number(templateId), Number(user.id)],
  );

  if (Number(result.affectedRows ?? 0) === 0) {
    throw new Error("Template tidak ditemukan");
  }

  return {
    id: Number(templateId),
    title,
    messageText,
    createdAt: null,
    updatedAt: null,
  };
}

async function deleteTemplate(user, templateId) {
  const pool = getPool();
  const [result] = await pool.execute(
    "DELETE FROM push_contact_templates WHERE id = ? AND user_id = ?",
    [Number(templateId), Number(user.id)],
  );
  return Number(result.affectedRows ?? 0) > 0;
}

async function assertGroupForUser(pool, userId, groupId, botId = null) {
  const clauses = ["g.id = ?", "b.user_id = ?"];
  const params = [Number(groupId), Number(userId)];
  if (botId) {
    clauses.push("b.id = ?");
    params.push(Number(botId));
  }

  const [rows] = await pool.execute(
    `SELECT g.id, g.bot_id, g.group_jid, g.name, g.is_active, b.phone_number,
            COALESCE(s.bot_info_phone_number, b.owner_phone_number) AS owner_phone_number
       FROM "groups" g
       JOIN bots b ON b.id = g.bot_id
       LEFT JOIN app_settings s ON s.user_id = b.user_id
      WHERE ${clauses.join(" AND ")}
      LIMIT 1`,
    params,
  );
  return rows[0] ?? null;
}

async function listExclusions(user, groupId) {
  const pool = getPool();
  const group = await assertGroupForUser(pool, user.id, groupId);
  if (!group) throw new Error("Group tidak ditemukan");

  const [rows] = await pool.execute(
    `SELECT id, group_id, phone_number, label, created_at
       FROM group_push_exclusions
      WHERE group_id = ?
      ORDER BY created_at DESC`,
    [Number(groupId)],
  );
  return rows.map(mapExclusion);
}

async function listMembers(user, groupId) {
  const pool = getPool();
  const group = await assertGroupForUser(pool, user.id, groupId);
  if (!group) throw new Error("Group tidak ditemukan");

  const sock = baileysManager.getSocketForBot(group.bot_id);
  if (!sock) {
    throw new Error("Bot harus online untuk memuat anggota group");
  }

  const [exclusions] = await pool.execute(
    `SELECT id, phone_number, label
       FROM group_push_exclusions
      WHERE group_id = ?`,
    [Number(groupId)],
  );
  const exclusionsByPhone = new Map(
    exclusions
      .map((row) => [normalizePhone(row.phone_number), row])
      .filter(([phoneNumber]) => Boolean(phoneNumber)),
  );

  const metadata = await sock.groupMetadata(group.group_jid);
  const participants = Array.isArray(metadata.participants) ? metadata.participants : [];
  const botNumber = normalizePhone(group.phone_number);

  return participants
    .map((participant) => mapParticipant(participant, exclusionsByPhone, botNumber))
    .filter((member) => member.jid)
    .sort((a, b) =>
      Number(b.isAdmin) - Number(a.isAdmin) ||
      Number(b.isBot) - Number(a.isBot) ||
      a.phoneNumber.localeCompare(b.phoneNumber),
    );
}

async function addExclusion(user, groupId, payload) {
  const pool = getPool();
  const group = await assertGroupForUser(pool, user.id, groupId);
  if (!group) throw new Error("Group tidak ditemukan");

  const phoneNumber = normalizePhone(payload.phoneNumber ?? payload.phone_number);
  const label = String(payload.label ?? "").trim() || null;
  if (!phoneNumber) throw new Error("Nomor wajib diisi");

  const [result] = await pool.execute(
    `INSERT INTO group_push_exclusions (group_id, phone_number, label)
     VALUES (?, ?, ?)
     ON CONFLICT (group_id, phone_number)
     DO UPDATE SET label = EXCLUDED.label
     RETURNING id`,
    [Number(groupId), phoneNumber, label],
  );

  return {
    id: Number(result.insertId ?? result.id ?? 0),
    groupId: Number(groupId),
    phoneNumber,
    label,
    createdAt: null,
  };
}

async function deleteExclusion(user, groupId, exclusionId) {
  const pool = getPool();
  const group = await assertGroupForUser(pool, user.id, groupId);
  if (!group) throw new Error("Group tidak ditemukan");

  const [result] = await pool.execute(
    "DELETE FROM group_push_exclusions WHERE id = ? AND group_id = ?",
    [Number(exclusionId), Number(groupId)],
  );
  return Number(result.affectedRows ?? 0) > 0;
}

async function startPush(user, { templateId, groupId, botId }) {
  const pool = getPool();
  const running = await getRunningRun(user);
  if (running) {
    throw new Error("Push kontak masih berjalan. Tunggu sampai selesai sebelum menjalankan lagi.");
  }

  const [templateRows, group] = await Promise.all([
    pool.execute(
      "SELECT id, title, message_text FROM push_contact_templates WHERE id = ? AND user_id = ? LIMIT 1",
      [Number(templateId), Number(user.id)],
    ).then(([rows]) => rows),
    assertGroupForUser(pool, user.id, groupId, botId),
  ]);
  const template = templateRows[0] ?? null;

  if (!template) throw new Error("Template tidak ditemukan");
  if (!group) throw new Error("Group tidak ditemukan untuk bot yang dipilih");
  if (!Boolean(group.is_active)) {
    throw new Error("Group sedang dimatikan di Kelola Group");
  }

  const sock = baileysManager.getSocketForBot(group.bot_id);
  if (!sock) {
    throw new Error("Bot harus online untuk menjalankan push kontak");
  }

  const metadata = await sock.groupMetadata(group.group_jid);
  const participants = Array.isArray(metadata.participants) ? metadata.participants : [];
  const [exclusions] = await pool.execute(
    "SELECT phone_number FROM group_push_exclusions WHERE group_id = ?",
    [Number(groupId)],
  );
  const excludedNumbers = new Set(exclusions.map((row) => normalizePhone(row.phone_number)).filter(Boolean));
  const botNumber = normalizePhone(group.phone_number);

  const targets = participants
    .filter((participant) => !isGroupAdmin(participant))
    .filter((participant) => {
      const phoneNumber = getParticipantPhoneNumber(participant);
      if (!phoneNumber) return false;
      if (phoneNumber === botNumber) return false;
      return !excludedNumbers.has(phoneNumber);
    })
    .map((participant) => ({
      jid: getParticipantTargetJid(participant),
      phoneNumber: getParticipantPhoneNumber(participant),
    }))
    .filter((target) => target.jid && target.phoneNumber);

  if (targets.length === 0) {
    throw new Error("Tidak ada member yang bisa dipush setelah admin dan pengecualian dilewati");
  }

  const [runResult] = await pool.execute(
    `INSERT INTO push_contact_runs (user_id, template_id, group_id, total_targets)
     VALUES (?, ?, ?, ?)`,
    [Number(user.id), Number(templateId), Number(groupId), targets.length],
  );
  const runId = Number(runResult.insertId ?? 0);

  runPushInBackground({
    runId,
    userId: Number(user.id),
    botId: Number(group.bot_id),
    groupName: String(group.name ?? metadata.subject ?? "-"),
    ownerPhoneNumber: String(group.owner_phone_number ?? ""),
    targets,
    messageText: String(template.message_text),
  });

  return {
    runId,
    totalTargets: targets.length,
    isRunning: true,
    running: {
      id: runId,
      status: "running",
      totalTargets: targets.length,
      successCount: 0,
      failedCount: 0,
      startedAt: null,
      finishedAt: null,
    },
    message: `Push kontak dimulai ke ${targets.length} member. Admin dan nomor pengecualian dilewati.`,
  };
}

async function notifyPushDoneOwner({ pool, userId, botId, ownerPhoneNumber, detail }) {
  const ownerJid = phoneToWhatsappJid(ownerPhoneNumber);
  if (!ownerJid) {
    logger.warn(`Push contact done notification skipped: owner phone number is empty for user ${userId}`);
    return;
  }

  const sock = baileysManager.getSocketForBot(botId);
  if (!sock) {
    logger.warn(`Push contact done notification skipped: bot ${botId} is offline`);
    return;
  }

  try {
    await sock.sendMessage(ownerJid, { text: detail });
    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [
        userId,
        "push_contact_owner_notified",
        `Notifikasi push kontak selesai dikirim ke owner ${normalizePhone(ownerPhoneNumber)}`,
      ],
    );
  } catch (err) {
    logger.warn(err, `Push contact done notification failed for owner ${normalizePhone(ownerPhoneNumber)}`);
  }
}

async function runPushInBackground({ runId, userId, botId, groupName, ownerPhoneNumber, targets, messageText }) {
  const pool = getPool();
  let success = 0;
  let failed = 0;

  try {
    for (const [index, target] of targets.entries()) {
      try {
        const sock = baileysManager.getSocketForBot(botId);
        if (!sock) {
          throw new Error("Bot offline");
        }
        await sock.sendMessage(target.jid, { text: messageText });
        success += 1;

        await pool.execute(
          "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
          [userId, "push_contact_sent", `No ${target.phoneNumber} berhasil di push kontak jam ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`],
        );
      } catch (err) {
        failed += 1;
        logger.warn(err, `Push contact failed to ${target.phoneNumber || target.jid}`);
      }

      await pool.execute(
        `UPDATE push_contact_runs
            SET success_count = ?,
                failed_count = ?
          WHERE id = ?`,
        [success, failed, runId],
      );

      if (index < targets.length - 1) {
        const delayMs = randomDelayMs();
        logger.info(`Push contact delay: ${Math.round(delayMs / 1000)}s`);
        await sleep(delayMs);
      }
    }

    await pool.execute(
      `UPDATE push_contact_runs
          SET status = 'done',
              success_count = ?,
              failed_count = ?,
              finished_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [success, failed, runId],
    );

    const doneDetail = `Push kontak group ${groupName} selesai: ${success}/${targets.length} berhasil`;

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [userId, "push_contact_done", doneDetail],
    );

    await notifyPushDoneOwner({
      pool,
      userId,
      botId,
      ownerPhoneNumber,
      detail: doneDetail,
    });
  } catch (err) {
    logger.error(err, `Push contact run ${runId} stopped unexpectedly`);
    await pool.execute(
      `UPDATE push_contact_runs
          SET status = 'failed',
              success_count = ?,
              failed_count = ?,
              finished_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [success, Math.max(failed, targets.length - success), runId],
    );
    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [userId, "push_contact_failed", `Push kontak group ${groupName} gagal sebelum selesai`],
    );
  }
}

export const pushContactService = {
  getStatus,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listExclusions,
  listMembers,
  addExclusion,
  deleteExclusion,
  startPush,
};
