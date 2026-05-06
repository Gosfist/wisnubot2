import { getPool } from "../config/database.js";
import { schedulerService } from "../services/scheduler.service.js";
import {
  resolveBroadcastTable,
  parseScheduleEntries,
  unionDaysFromEntries,
} from "../utils/helpers.js";
import { logger } from "../utils/logger.js";
import { deleteUploadedFile, getUploadedImageUrl } from "../middleware/upload.js";

function ensureBroadcastAccess(_req, _res) {
  return true;
}

function cleanupUploadedImage(req, preservedImageUrl = null) {
  const uploadedImageUrl = getUploadedImageUrl(req);
  if (!uploadedImageUrl || uploadedImageUrl === preservedImageUrl) {
    return;
  }

  deleteUploadedFile(uploadedImageUrl);
}

function sendBroadcastError(res, req, status, error, preservedImageUrl = null) {
  cleanupUploadedImage(req, preservedImageUrl);
  return res.status(status).json({ error });
}

function parseList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value == null) {
    return [];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function parseIdList(value) {
  return [
    ...new Set(
      parseList(value)
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

function parseStringList(value) {
  return [...new Set(parseList(value).map((item) => String(item).trim()).filter(Boolean))];
}

function parseBooleanValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return false;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return Boolean(value);
}

function normalizeDay(day) {
  return String(day ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f']/g, "");
}

function normalizeTimeList(times) {
  return [...new Set(parseList(times).map((time) => String(time).trim()).filter(Boolean))];
}

function normalizeDayList(days) {
  return [...new Set(parseList(days).map(normalizeDay).filter(Boolean))];
}

/**
 * Normalize incoming schedule input from request body.
 * Accepts either:
 *   - new format: [{ time: "HH:MM", days: ["Senin", ...] }]
 *   - legacy format: array of "HH:MM" strings (combined with scheduleDays)
 * Returns canonical entries [{ time, days: [normalized day keys] }].
 */
function normalizeScheduleEntries(scheduleTimeInput, scheduleDaysInput) {
  return parseScheduleEntries(scheduleTimeInput, scheduleDaysInput);
}

function parseTimeToMinutes(time) {
  const [hour, minute] = String(time).split(":").map((item) => Number(item));
  return hour * 60 + minute;
}

function hasScheduleGapConflict(timesA, timesB, minGapMinutes = 30) {
  for (const first of timesA) {
    const firstMinutes = parseTimeToMinutes(first);
    for (const second of timesB) {
      const secondMinutes = parseTimeToMinutes(second);
      const diff = Math.abs(firstMinutes - secondMinutes);
      const nearestDiff = Math.min(diff, 1440 - diff);
      if (nearestDiff < minGapMinutes) {
        return {
          first,
          second,
          diff: nearestDiff,
        };
      }
    }
  }

  return null;
}

function hasDayOverlap(daysA, daysB) {
  if (daysA.length === 0 || daysB.length === 0) {
    return false;
  }

  const secondSet = new Set(daysB);
  return daysA.some((day) => secondSet.has(day));
}

async function resolveEffectiveTargetBotIds(pool, user, targetBotIds) {
  const [ownerBots] = await pool.execute(
    `SELECT id FROM bots WHERE user_id = ? AND is_online = 1 AND COALESCE(bot_purpose, 'main') = 'main' ORDER BY created_at DESC`,
    [user.id],
  );

  return ownerBots.map((bot) => Number(bot.id)).filter((id) => id > 0);
}

async function resolveEffectiveTargetGroupIds(
  pool,
  user,
  targetGroupIds,
  targetExcludedGroupIds,
  targetBotIds,
) {
  const normalizedTargetGroupIds = parseIdList(targetGroupIds);
  const normalizedTargetExcludedGroupIds = parseIdList(targetExcludedGroupIds);
  const normalizedTargetBotIds = parseIdList(targetBotIds);

  if (normalizedTargetGroupIds.length > 0) {
    const clauses = [
      `g.id IN (${normalizedTargetGroupIds.map(() => "?").join(",")})`,
      "g.is_active = 1",
      "b.user_id = ?",
      "COALESCE(b.bot_purpose, 'main') = 'main'",
    ];
    const params = [...normalizedTargetGroupIds, user.id];

    if (normalizedTargetBotIds.length > 0) {
      clauses.push(`b.id IN (${normalizedTargetBotIds.map(() => "?").join(",")})`);
      params.push(...normalizedTargetBotIds);
    }

    const [groups] = await pool.execute(
      `SELECT g.id
       FROM \`groups\` g
       JOIN bots b ON b.id = g.bot_id
       WHERE ${clauses.join(" AND ")}`,
      params,
    );

    return [...new Set(groups.map((group) => Number(group.id)).filter((id) => id > 0))];
  }

  const clauses = ["b.user_id = ?", "g.is_active = 1", "COALESCE(b.bot_purpose, 'main') = 'main'"];
  const params = [user.id];

  if (normalizedTargetBotIds.length > 0) {
    clauses.push(`b.id IN (${normalizedTargetBotIds.map(() => "?").join(",")})`);
    params.push(...normalizedTargetBotIds);
  }

  if (normalizedTargetExcludedGroupIds.length > 0) {
    clauses.push(`g.id NOT IN (${normalizedTargetExcludedGroupIds.map(() => "?").join(",")})`);
    params.push(...normalizedTargetExcludedGroupIds);
  }

  const [groups] = await pool.execute(
    `SELECT g.id
     FROM \`groups\` g
     JOIN bots b ON b.id = g.bot_id
     WHERE ${clauses.join(" AND ")}`,
    params,
  );

  return [...new Set(groups.map((group) => Number(group.id)).filter((id) => id > 0))];
}

async function ensureNoBroadcastScheduleConflict(
  pool,
  broadcastTable,
  user,
  {
    broadcastId = null,
    title = "",
    targetGroupIds = [],
    targetExcludedGroupIds = [],
    targetBotIds = [],
    scheduleEntries = [],
    isActive = true,
  },
) {
  if (!isActive) {
    return;
  }

  if (!Array.isArray(scheduleEntries) || scheduleEntries.length === 0) {
    return;
  }

  const candidateGroupIds = await resolveEffectiveTargetGroupIds(
    pool,
    user,
    targetGroupIds,
    targetExcludedGroupIds,
    targetBotIds,
  );

  if (candidateGroupIds.length === 0) {
    return;
  }

  const params = [user.id];
  let sql =
    `SELECT id, title, target_group_ids, target_excluded_group_ids, target_bot_ids, schedule_time, schedule_days, is_active
     FROM ${broadcastTable}
     WHERE user_id = ? AND is_active = 1`;

  if (broadcastId) {
    sql += " AND id <> ?";
    params.push(broadcastId);
  }

  const [broadcasts] = await pool.execute(sql, params);
  const candidateGroupSet = new Set(candidateGroupIds);

  for (const broadcast of broadcasts) {
    const existingEntries = parseScheduleEntries(
      broadcast.schedule_time,
      broadcast.schedule_days,
    );
    if (existingEntries.length === 0) {
      continue;
    }

    // For each candidate entry, check time-gap conflict only against existing
    // entries that share at least one day with it.
    let timeConflict = null;
    let conflictExisting = null;
    outer: for (const candidate of scheduleEntries) {
      const candidateDaySet = new Set(candidate.days ?? []);
      for (const existing of existingEntries) {
        const sharesDay = (existing.days ?? []).some((d) => candidateDaySet.has(d));
        if (!sharesDay) continue;
        const conflict = hasScheduleGapConflict([candidate.time], [existing.time]);
        if (conflict) {
          timeConflict = conflict;
          conflictExisting = existing;
          break outer;
        }
      }
    }

    if (!timeConflict) {
      continue;
    }

    const existingGroupIds = await resolveEffectiveTargetGroupIds(
      pool,
      user,
      parseList(broadcast.target_group_ids),
      parseList(broadcast.target_excluded_group_ids),
      parseList(broadcast.target_bot_ids),
    );

    const overlappingGroupIds = existingGroupIds.filter((groupId) =>
      candidateGroupSet.has(groupId),
    );

    if (overlappingGroupIds.length === 0) {
      continue;
    }

    throw new Error(
      `Jadwal broadcast bentrok. Group yang sama sudah dipakai oleh broadcast "${String(
        broadcast.title ?? `#${broadcast.id}`,
      )}" pada jam ${conflictExisting?.time ?? timeConflict.second}. Minimal jarak antar broadcast untuk group yang sama adalah 30 menit.`,
    );
  }
}

export async function listBroadcasts(req, res) {
  try {
    if (!ensureBroadcastAccess(req, res)) {
      return;
    }

    const pool = getPool();
    const broadcastTable = await resolveBroadcastTable(pool);
    const [broadcasts] = await pool.execute(
      `SELECT * FROM ${broadcastTable} WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id],
    );

    res.json({ broadcasts });
  } catch (err) {
    logger.error(err, "List broadcasts error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function getBroadcastNameSignature(req, res) {
  try {
    if (!ensureBroadcastAccess(req, res)) {
      return;
    }

    const pool = getPool();
    const broadcastTable = await resolveBroadcastTable(pool);
    const [rows] = await pool.execute(
      `SELECT id, title FROM ${broadcastTable} WHERE user_id = ? ORDER BY id ASC`,
      [req.user.id],
    );

    const signature = rows
      .map((item) => `${item.id}:${String(item.title ?? "")}`)
      .join("|");

    res.json({ signature, total: rows.length });
  } catch (err) {
    logger.error(err, "Get broadcast name signature error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function createBroadcast(req, res) {
  try {
    if (!ensureBroadcastAccess(req, res)) {
      return;
    }

    const {
      title,
      messageText,
      targetGroupIds,
      targetExcludedGroupIds,
      targetBotIds,
      scheduleTime,
      scheduleDays,
    } = req.body;
    const pool = getPool();
    const userId = req.user.id;
    const broadcastTable = await resolveBroadcastTable(pool);

    const scheduleEntries = normalizeScheduleEntries(scheduleTime, scheduleDays);
    const normalizedTargetGroupIds = parseIdList(targetGroupIds);
    const normalizedTargetExcludedGroupIds = parseIdList(targetExcludedGroupIds);
    const unionDays = unionDaysFromEntries(scheduleEntries);

    if (scheduleEntries.length === 0) {
      return sendBroadcastError(res, req, 400, "Minimal pilih 1 jadwal broadcast (jam + hari)");
    }

    if (
      normalizedTargetGroupIds.length > 0 &&
      normalizedTargetExcludedGroupIds.length > 0
    ) {
      return sendBroadcastError(
        res,
        req,
        400,
        "Pilih salah satu mode target group: spesifik atau kecuali",
      );
    }

    if (
      normalizedTargetGroupIds.length > 0 ||
      normalizedTargetExcludedGroupIds.length > 0
    ) {
      const groupIdsToValidate =
        normalizedTargetGroupIds.length > 0
          ? normalizedTargetGroupIds
          : normalizedTargetExcludedGroupIds;
      const groupClauses = [
        `g.id IN (${groupIdsToValidate.map(() => "?").join(",")})`,
        "b.user_id = ?",
        "COALESCE(b.bot_purpose, 'main') = 'main'",
      ];
      const groupParams = [...groupIdsToValidate, userId];

      const [validGroups] = await pool.execute(
        `SELECT g.id
         FROM \`groups\` g
         JOIN bots b ON b.id = g.bot_id
         WHERE ${groupClauses.join(" AND ")}`,
        groupParams,
      );

      if (validGroups.length !== groupIdsToValidate.length) {
        return sendBroadcastError(
          res,
          req,
          400,
          "Group yang dipilih harus milik Anda",
        );
      }
    }

    const normalizedTargetBotIds = await resolveEffectiveTargetBotIds(
      pool,
      req.user,
      targetBotIds,
    );

    if (normalizedTargetBotIds.length === 0) {
      return sendBroadcastError(
        res,
        req,
        400,
        req.user.role === "owner"
          ? "Bot broadcast owner harus online terlebih dahulu"
          : "Pilih minimal satu bot online",
      );
    }

    const botClauses = [
      `id IN (${normalizedTargetBotIds.map(() => "?").join(",")})`,
      "user_id = ?",
      "is_online = 1",
      "COALESCE(bot_purpose, 'main') = 'main'",
    ];
    const botParams = [...normalizedTargetBotIds, userId];

    const [validBots] = await pool.execute(
      `SELECT id FROM bots WHERE ${botClauses.join(" AND ")}`,
      botParams,
    );

    if (validBots.length !== normalizedTargetBotIds.length) {
      return sendBroadcastError(
        res,
        req,
        400,
        "Bot yang dipilih harus milik Anda dan dalam status online",
      );
    }

    await ensureNoBroadcastScheduleConflict(pool, broadcastTable, req.user, {
      title,
      targetGroupIds: normalizedTargetGroupIds,
      targetExcludedGroupIds: normalizedTargetExcludedGroupIds,
      targetBotIds: normalizedTargetBotIds,
      scheduleEntries,
      isActive: true,
    });

    const imageUrl = getUploadedImageUrl(req);

    const [result] = await pool.execute(
      `INSERT INTO ${broadcastTable} (user_id, title, message_text, image_url, target_group_ids, target_excluded_group_ids, target_bot_ids, schedule_time, schedule_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        title,
        messageText,
        imageUrl,
        JSON.stringify(normalizedTargetGroupIds),
        JSON.stringify(normalizedTargetExcludedGroupIds),
        JSON.stringify(normalizedTargetBotIds),
        JSON.stringify(scheduleEntries),
        JSON.stringify(unionDays),
      ],
    );

    const broadcastId = result.insertId;

    if (scheduleEntries.length > 0) {
      schedulerService.registerJob(
        broadcastId,
        userId,
        scheduleEntries,
        unionDays,
      );
    }

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [userId, "create_broadcast", `Broadcast: ${title}`],
    );

    logger.info(`Broadcast created: ${title} (ID: ${broadcastId})`);
    res
      .status(201)
      .json({ message: "Broadcast berhasil dibuat", id: broadcastId });
  } catch (err) {
    cleanupUploadedImage(req);
    logger.error(err, "Create broadcast error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function updateBroadcast(req, res) {
  let currentBroadcast = null;

  try {
    if (!ensureBroadcastAccess(req, res)) {
      return;
    }

    const { broadcastId } = req.params;
    const {
      title,
      messageText,
      targetGroupIds,
      targetExcludedGroupIds,
      targetBotIds,
      scheduleTime,
      scheduleDays,
      isActive,
    } = req.body;
    const pool = getPool();
    const broadcastTable = await resolveBroadcastTable(pool);

    const [broadcasts] = await pool.execute(
      `SELECT * FROM ${broadcastTable} WHERE id = ? AND user_id = ?`,
      [broadcastId, req.user.id],
    );

    if (broadcasts.length === 0) {
      return sendBroadcastError(res, req, 404, "Broadcast tidak ditemukan");
    }

    currentBroadcast = broadcasts[0];

    const incomingScheduleEntries =
      scheduleTime !== undefined
        ? normalizeScheduleEntries(scheduleTime, scheduleDays)
        : null;

    if (scheduleTime !== undefined && (incomingScheduleEntries?.length ?? 0) === 0) {
      return sendBroadcastError(res, req, 400, "Minimal pilih 1 jadwal broadcast (jam + hari)");
    }

    let normalizedTargetGroupIds = null;
    if (targetGroupIds !== undefined) {
      normalizedTargetGroupIds = parseIdList(targetGroupIds);
    }

    let normalizedTargetExcludedGroupIds = null;
    if (targetExcludedGroupIds !== undefined) {
      normalizedTargetExcludedGroupIds = parseIdList(targetExcludedGroupIds);
    }

    if (
      normalizedTargetGroupIds !== null &&
      normalizedTargetExcludedGroupIds !== null &&
      normalizedTargetGroupIds.length > 0 &&
      normalizedTargetExcludedGroupIds.length > 0
    ) {
      return sendBroadcastError(
        res,
        req,
        400,
        "Pilih salah satu mode target group: spesifik atau kecuali",
      );
    }

    const groupIdsToValidate =
      normalizedTargetGroupIds !== null
        ? normalizedTargetGroupIds
        : normalizedTargetExcludedGroupIds !== null
          ? normalizedTargetExcludedGroupIds
          : null;

    if (groupIdsToValidate && groupIdsToValidate.length > 0) {
      const groupClauses = [
        `g.id IN (${groupIdsToValidate.map(() => "?").join(",")})`,
        "b.user_id = ?",
        "COALESCE(b.bot_purpose, 'main') = 'main'",
      ];
      const groupParams = [...groupIdsToValidate, req.user.id];

      const [validGroups] = await pool.execute(
        `SELECT g.id
         FROM \`groups\` g
         JOIN bots b ON b.id = g.bot_id
         WHERE ${groupClauses.join(" AND ")}`,
        groupParams,
      );

      if (validGroups.length !== groupIdsToValidate.length) {
        return sendBroadcastError(
          res,
          req,
          400,
          "Group yang dipilih harus milik Anda",
        );
      }
    }

    let normalizedTargetBotIds = null;
    if (targetBotIds !== undefined) {
      normalizedTargetBotIds = await resolveEffectiveTargetBotIds(
        pool,
        req.user,
        targetBotIds,
      );

      if (normalizedTargetBotIds.length === 0) {
        return sendBroadcastError(
          res,
          req,
          400,
          req.user.role === "owner"
            ? "Bot broadcast owner harus online terlebih dahulu"
            : "Pilih minimal satu bot online",
        );
      }

      const botClauses = [
        `id IN (${normalizedTargetBotIds.map(() => "?").join(",")})`,
        "user_id = ?",
        "is_online = 1",
        "COALESCE(bot_purpose, 'main') = 'main'",
      ];
      const botParams = [...normalizedTargetBotIds, req.user.id];

      const [validBots] = await pool.execute(
        `SELECT id FROM bots WHERE ${botClauses.join(" AND ")}`,
        botParams,
      );

      if (validBots.length !== normalizedTargetBotIds.length) {
        return sendBroadcastError(
          res,
          req,
          400,
          "Bot yang dipilih harus milik Anda dan dalam status online",
        );
      }
    }

    const effectiveTargetGroupIds =
      normalizedTargetGroupIds !== null
        ? normalizedTargetGroupIds
        : parseList(currentBroadcast.target_group_ids);
    const effectiveTargetExcludedGroupIds =
      normalizedTargetExcludedGroupIds !== null
        ? normalizedTargetExcludedGroupIds
        : parseList(currentBroadcast.target_excluded_group_ids);
    const effectiveTargetBotIds =
      normalizedTargetBotIds !== null
        ? normalizedTargetBotIds
        : parseList(currentBroadcast.target_bot_ids);
    const effectiveScheduleEntries =
      incomingScheduleEntries !== null
        ? incomingScheduleEntries
        : parseScheduleEntries(
            currentBroadcast.schedule_time,
            currentBroadcast.schedule_days,
          );
    const effectiveUnionDays = unionDaysFromEntries(effectiveScheduleEntries);
    const effectiveIsActive =
      isActive !== undefined
        ? parseBooleanValue(isActive)
        : Number(currentBroadcast.is_active) === 1;

    await ensureNoBroadcastScheduleConflict(pool, broadcastTable, req.user, {
      broadcastId: parseInt(broadcastId, 10),
      title: title || currentBroadcast.title || "",
      targetGroupIds: effectiveTargetGroupIds,
      targetExcludedGroupIds: effectiveTargetExcludedGroupIds,
      targetBotIds: effectiveTargetBotIds,
      scheduleEntries: effectiveScheduleEntries,
      isActive: effectiveIsActive,
    });

    const newImageUrl = getUploadedImageUrl(req);
    const removeImage = req.body.removeImage === "true" || req.body.removeImage === true;
    let imageUrlToSet = null;
    let imageUrlIsSet = false;
    if (newImageUrl) {
      imageUrlToSet = newImageUrl;
      imageUrlIsSet = true;
    } else if (removeImage) {
      imageUrlToSet = null;
      imageUrlIsSet = true;
    }

    await pool.execute(
      `UPDATE ${broadcastTable} SET
        title = COALESCE(?, title),
        message_text = COALESCE(?, message_text),
        image_url = ${imageUrlIsSet ? "?" : "image_url"},
        target_group_ids = COALESCE(?, target_group_ids),
        target_excluded_group_ids = COALESCE(?, target_excluded_group_ids),
        target_bot_ids = COALESCE(?, target_bot_ids),
        schedule_time = COALESCE(?, schedule_time),
        schedule_days = COALESCE(?, schedule_days),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        title || null,
        messageText || null,
        ...(imageUrlIsSet ? [imageUrlToSet] : []),
        normalizedTargetGroupIds !== null
          ? JSON.stringify(normalizedTargetGroupIds)
          : null,
        normalizedTargetExcludedGroupIds !== null
          ? JSON.stringify(normalizedTargetExcludedGroupIds)
          : null,
        normalizedTargetBotIds ? JSON.stringify(normalizedTargetBotIds) : null,
        incomingScheduleEntries !== null
          ? JSON.stringify(incomingScheduleEntries)
          : null,
        incomingScheduleEntries !== null
          ? JSON.stringify(unionDaysFromEntries(incomingScheduleEntries))
          : null,
        isActive !== undefined ? (parseBooleanValue(isActive) ? 1 : 0) : null,
        broadcastId,
      ],
    );

    schedulerService.unregisterJob(parseInt(broadcastId, 10));
    if (effectiveScheduleEntries.length > 0 && effectiveIsActive) {
      schedulerService.registerJob(
        parseInt(broadcastId, 10),
        req.user.id,
        effectiveScheduleEntries,
        effectiveUnionDays,
      );
    }

    if (newImageUrl && currentBroadcast.image_url && currentBroadcast.image_url !== newImageUrl) {
      deleteUploadedFile(currentBroadcast.image_url);
    } else if (removeImage && currentBroadcast.image_url) {
      deleteUploadedFile(currentBroadcast.image_url);
    }

    res.json({ message: "Broadcast berhasil diupdate" });
  } catch (err) {
    cleanupUploadedImage(req, currentBroadcast?.image_url ?? null);
    logger.error(err, "Update broadcast error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function deleteBroadcast(req, res) {
  try {
    if (!ensureBroadcastAccess(req, res)) {
      return;
    }

    const { broadcastId } = req.params;
    const pool = getPool();
    const broadcastTable = await resolveBroadcastTable(pool);

    const [broadcasts] = await pool.execute(
      `SELECT id FROM ${broadcastTable} WHERE id = ? AND user_id = ?`,
      [broadcastId, req.user.id],
    );

    if (broadcasts.length === 0) {
      return res.status(404).json({ error: "Broadcast tidak ditemukan" });
    }

    // Delete associated image file if exists
    const deletedBroadcast = broadcasts[0];
    if (deletedBroadcast.image_url) {
      deleteUploadedFile(deletedBroadcast.image_url);
    }

    schedulerService.unregisterJob(parseInt(broadcastId, 10));
    await pool.execute(`DELETE FROM ${broadcastTable} WHERE id = ?`, [
      broadcastId,
    ]);

    res.json({ message: "Broadcast berhasil dihapus" });
  } catch (err) {
    logger.error(err, "Delete broadcast error");
    res.status(500).json({ error: "Server error" });
  }
}
