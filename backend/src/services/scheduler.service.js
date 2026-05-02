import cron from "node-cron";
import { getPool } from "../config/database.js";
import { baileysManager } from "./baileys.service.js";
import { messageService } from "./message.service.js";
import { resolveBroadcastTable, parseScheduleEntries } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";

class SchedulerService {
  constructor() {
    this.jobs = new Map();
  }

  normalizeDay(day) {
    return day
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f']/g, "");
  }

  parseList(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return trimmed
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }

    return [];
  }

  toCronExpression(time, days) {
    const [hour, minute] = time.split(":");
    const dayMap = {
      minggu: 0,
      sunday: 0,
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      senin: 1,
      selasa: 2,
      rabu: 3,
      kamis: 4,
      jumat: 5,
      sabtu: 6,
    };
    const cronDays = this.parseList(days)
      .map((d) => dayMap[this.normalizeDay(d)])
      .filter((d) => d !== undefined);

    if (cronDays.length === 0) return null;
    return `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * ${cronDays.join(",")}`;
  }

  registerJob(broadcastId, userId, scheduleTimes, scheduleDays) {
    this.unregisterJob(broadcastId);
    // Accept either new structured format ([{time, days}]) or legacy (times[] + days[]).
    const entries = parseScheduleEntries(scheduleTimes, scheduleDays);
    const tasks = [];

    for (const entry of entries) {
      const cronExpr = this.toCronExpression(entry.time, entry.days);
      if (!cronExpr) {
        logger.warn(
          {
            broadcastId,
            scheduleTime: entry.time,
            scheduleDays: entry.days,
          },
          "Invalid cron for broadcast",
        );
        continue;
      }

      const task = cron.schedule(
        cronExpr,
        async () => {
          logger.info(
            `Running scheduled broadcast ${broadcastId} for user ${userId}`,
          );
          await this.executeBroadcast(broadcastId, userId);
        },
        {
          timezone: "Asia/Jakarta",
        },
      );

      tasks.push(task);
      logger.info(
        `Scheduled broadcast ${broadcastId}: ${cronExpr} (Asia/Jakarta)`,
      );
    }

    if (tasks.length > 0) {
      this.jobs.set(broadcastId, tasks);
    }
  }

  unregisterJob(broadcastId) {
    const tasks = this.jobs.get(broadcastId);
    if (tasks) {
      for (const task of tasks) {
        task.stop();
      }
      this.jobs.delete(broadcastId);
      logger.info(`Unregistered broadcast job ${broadcastId}`);
    }
  }

  async executeBroadcast(broadcastId, userId) {
    try {
      const pool = getPool();
      const broadcastTable = await resolveBroadcastTable(pool);

      const [broadcasts] = await pool.execute(
        `SELECT * FROM ${broadcastTable} WHERE id = ? AND is_active = 1`,
        [broadcastId],
      );

      if (broadcasts.length === 0) {
        logger.warn(`Broadcast ${broadcastId} not found or inactive`);
        this.unregisterJob(broadcastId);
        return;
      }


      const broadcast = broadcasts[0];
      const targetGroupIds = this.parseList(broadcast.target_group_ids)
        .map((id) => parseInt(id, 10))
        .filter((id) => !Number.isNaN(id));
      const targetExcludedGroupIds = this.parseList(
        broadcast.target_excluded_group_ids,
      )
        .map((id) => parseInt(id, 10))
        .filter((id) => !Number.isNaN(id));
      const targetBotIds = this.parseList(broadcast.target_bot_ids)
        .map((id) => parseInt(id, 10))
        .filter((id) => !Number.isNaN(id));
      let groups = [];
      let closedGroups = [];
      if (targetGroupIds.length === 0) {
        const clauses = ["b.user_id = ?", "g.is_active = 1"];
        const params = [userId];
        if (targetBotIds.length > 0) {
          clauses.push(`b.id IN (${targetBotIds.map(() => "?").join(",")})`);
          params.push(...targetBotIds);
        }
        if (targetExcludedGroupIds.length > 0) {
          clauses.push(
            `g.id NOT IN (${targetExcludedGroupIds.map(() => "?").join(",")})`,
          );
          params.push(...targetExcludedGroupIds);
        }
        const [allActiveGroups] = await pool.execute(
          `SELECT g.id, g.group_jid, g.name FROM \`groups\` g
           JOIN bots b ON b.id = g.bot_id
           WHERE ${clauses.join(" AND ")}`,
          params,
        );
        groups = allActiveGroups;
      } else {
        const selectedClauses = [
          `g.id IN (${targetGroupIds.map(() => "?").join(",")})`,
          "b.user_id = ?",
        ];
        const selectedParams = [...targetGroupIds, userId];

        if (targetBotIds.length > 0) {
          selectedClauses.push(
            `b.id IN (${targetBotIds.map(() => "?").join(",")})`,
          );
          selectedParams.push(...targetBotIds);
        }

        const [selectedGroups] = await pool.execute(
          `SELECT g.id, g.group_jid, g.name, g.is_active
           FROM \`groups\` g
           JOIN bots b ON b.id = g.bot_id
           WHERE ${selectedClauses.join(" AND ")}`,
          selectedParams,
        );
        groups = selectedGroups.filter((group) => Number(group.is_active) === 1);
        closedGroups = selectedGroups.filter((group) => Number(group.is_active) !== 1);
      }

      for (const group of closedGroups) {
        const groupName = String(group.name ?? group.group_jid ?? "-");
        await pool.execute(
          "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
          [
            userId,
            "broadcast_group_closed",
            `Group ${groupName} status group close jam ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`,
          ],
        );
      }

      const groupJids = groups.map((g) => g.group_jid);
      if (groupJids.length === 0) {
        logger.warn(`No active groups for broadcast ${broadcastId}`);
        return;
      }

      const preferredConnection =
        await baileysManager.getPreferredBroadcastConnection(
          userId,
          targetBotIds,
        );
      if (!preferredConnection) {
        logger.warn(`No active bot socket for user ${userId}`);
        return;
      }

      const results = await messageService.sendBulkMessages(
        preferredConnection.sock,
        userId,
        groupJids,
        broadcast.message_text,
        broadcast.image_url || null,
      );

      const sentCount = results.filter((r) => r.status === "sent").length;
      const groupNameByJid = new Map(
        groups.map((group) => [String(group.group_jid), String(group.name ?? group.group_jid)]),
      );
      for (const result of results) {
        if (result.status !== "sent") continue;
        const groupName = groupNameByJid.get(String(result.jid)) ?? String(result.jid);
        await pool.execute(
          "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
          [
            userId,
            "broadcast_group_sent",
            `Group ${groupName} berhasil di broadcast jam ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`,
          ],
        );
      }
      await pool.execute(
        "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
        [
          userId,
          "broadcast_sent",
          `Broadcast "${broadcast.title}" dikirim ke ${sentCount}/${groupJids.length} group`,
        ],
      );
      baileysManager.io?.to(`user_${userId}`).emit("bot_status", {
        type: "broadcast_sent",
        broadcastId,
        sentCount,
      });

      logger.info(
        `Broadcast ${broadcastId} sent to ${sentCount} groups via bot ${preferredConnection.phoneNumber ?? preferredConnection.botId}`,
      );
    } catch (err) {
      logger.error(err, `Execute broadcast ${broadcastId} error`);
    }
  }

  async loadAll() {
    try {
      const pool = getPool();
      const broadcastTable = await resolveBroadcastTable(pool);
      const [broadcasts] = await pool.execute(
        `SELECT id, user_id, schedule_time, schedule_days FROM ${broadcastTable} WHERE is_active = 1 AND schedule_time IS NOT NULL`,
      );

      for (const broadcast of broadcasts) {
        const entries = parseScheduleEntries(
          broadcast.schedule_time,
          broadcast.schedule_days,
        );
        if (entries.length > 0) {
          this.registerJob(
            broadcast.id,
            broadcast.user_id,
            entries,
            broadcast.schedule_days,
          );
        }
      }

      logger.info(`Loaded ${broadcasts.length} scheduled broadcasts`);
    } catch (err) {
      logger.error(err, "Load scheduled broadcasts error");
    }
  }
}

export const schedulerService = new SchedulerService();
