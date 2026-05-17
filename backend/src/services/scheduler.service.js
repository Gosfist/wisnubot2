import cron from "node-cron";
import { getPool } from "../config/database.js";
import { baileysManager } from "./baileys.service.js";
import { messageService } from "./message.service.js";
import { realtimeService } from "./realtime.service.js";
import { resolveBroadcastTable, parseScheduleEntries } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";

const EXPIRY_NOTIFY_LOOKBACK_DAYS = 2;

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.transactionExpiryJob = null;
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

  isActiveFlag(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }

  isGroupJid(value) {
    return /^\d+@g\.us$/i.test(String(value ?? "").trim());
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

  normalizeWhatsappJid(value) {
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

  formatDate(value) {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  normalizeCommandName(value) {
    return String(value ?? "").trim().replace(/^\/+/, "");
  }

  formatTransactionProduct(row) {
    const source = `${row.nama_perintah ?? ""} ${row.gemini_price_plan_label ?? ""}`.toLowerCase();
    if (source.includes("canva")) return "Canva";
    if (source.includes("gemini") || row.gemini_price_plan_id) return "Gemini";
    return (
      this.normalizeCommandName(row.nama_perintah) ||
      String(row.gemini_price_plan_label ?? "").trim() ||
      "-"
    );
  }

  formatContactLines(row) {
    const platform = String(row.platform ?? "whatsapp").trim().toLowerCase();
    const customer = String(row.customer_jid ?? "").replace("@s.whatsapp.net", "");
    const lines = [];

    if (platform === "shopee") {
      lines.push(`email: ${row.buyer_email || customer || "-"}`);
    } else {
      lines.push(`Nomor WA: ${customer || "-"}`);
      if (row.buyer_email) lines.push(`email: ${row.buyer_email}`);
    }

    if (row.google_account_email) {
      lines.push(`google: ${row.google_account_email}`);
    }

    return lines.join("\n");
  }

  isPastDate(value) {
    if (!value) return false;
    const date = value instanceof Date ? value : new Date(value);
    return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
  }

  registerTransactionExpiryJob() {
    if (this.transactionExpiryJob) {
      return;
    }

    this.transactionExpiryJob = cron.schedule(
      "0 0 * * *",
      async () => {
        await this.notifyExpiredTransactions();
      },
      {
        timezone: "Asia/Jakarta",
      },
    );
    logger.info("Scheduled transaction expiry notification: 0 0 * * * (Asia/Jakarta)");
  }

  buildTransactionExpiryMessage(row, type) {
    const isWarranty = type === "warranty";
    const expDate = isWarranty ? row.warranty_expires_at : row.active_expires_at;
    const duration = isWarranty ? row.warranty_duration_days : row.active_duration_days;
    const contactLines = this.formatContactLines(row);

    return (
      `Notifikasi transaksi expired.\n\n` +
      `idTrx: ${row.pakasir_order_id}\n` +
      `Produk: ${this.formatTransactionProduct(row)}\n` +
      `${contactLines}\n` +
      `Platform: ${row.platform ?? "whatsapp"}\n` +
      `Nominal: Rp ${Number(row.amount ?? 0).toLocaleString("id-ID")}\n` +
      `Durasi: ${duration ? `${Number(duration)} hari` : "-"}\n` +
      `Tanggal Exp: ${this.formatDate(expDate)}`
    );
  }

  async sendExpiryNotification(pool, row, type) {
    const ownerJid = this.normalizeWhatsappJid(row.owner_phone_number);
    if (!ownerJid) {
      logger.warn(`Skip transaction expiry notification ${row.pakasir_order_id}: owner phone empty`);
      return false;
    }

    const sock = baileysManager.getSocketForBot(Number(row.bot_id));
    if (!sock) {
      logger.warn(`Skip transaction expiry notification ${row.pakasir_order_id}: bot ${row.bot_id} offline`);
      return false;
    }

    await sock.sendMessage(ownerJid, {
      text: this.buildTransactionExpiryMessage(row, type),
    });

    const column = type === "warranty" ? "warranty_exp_notified_at" : "active_exp_notified_at";
    await pool.execute(
      `UPDATE cs_transactions
          SET ${column} = CURRENT_TIMESTAMP
        WHERE id = ? AND ${column} IS NULL`,
      [Number(row.id)],
    );
    return true;
  }

  async expireActiveTransactions(pool) {
    const result = await pool.query(
      `UPDATE cs_transactions
          SET active_status = 'expired'
        WHERE status = 'paid'
          AND COALESCE(platform, '') <> 'pribadi'
          AND active_expires_at IS NOT NULL
          AND active_expires_at < CURRENT_TIMESTAMP
          AND COALESCE(active_status, 'aktif') <> 'expired'
        RETURNING id, user_id, pakasir_order_id`,
    );
    const rows = result.rows ?? [];

    const userIds = [...new Set(rows.map((row) => Number(row.user_id)).filter(Boolean))];
    for (const userId of userIds) {
      realtimeService.emitTrxGeminiChanged(userId, { source: "daily_active_expire" });
    }

    if (rows.length > 0) {
      logger.info(
        {
          count: rows.length,
          idTrx: rows.slice(0, 20).map((row) => row.pakasir_order_id),
        },
        "Daily active status expired transactions updated",
      );
    }

    return rows.length;
  }

  async notifyExpiredTransactions() {
    try {
      const pool = getPool();
      const expiredCount = await this.expireActiveTransactions(pool);
      const [rows] = await pool.execute(
        `SELECT tx.id, tx.user_id, tx.customer_jid, tx.pakasir_order_id, tx.amount,
                tx.platform, tx.active_duration_days, tx.warranty_duration_days,
                tx.active_expires_at, tx.warranty_expires_at,
                tx.active_exp_notified_at, tx.warranty_exp_notified_at,
                tx.google_account_id, tx.gemini_price_plan_id, tx.buyer_email,
                cs.nama_perintah, ga.email AS google_account_email,
                gp.label AS gemini_price_plan_label,
                b.id AS bot_id,
                COALESCE(s.bot_info_phone_number, b.owner_phone_number, b.phone_number) AS owner_phone_number
           FROM cs_transactions tx
           LEFT JOIN customer_service cs ON cs.id = tx.cs_id
           LEFT JOIN google_accounts ga ON ga.id = tx.google_account_id
           LEFT JOIN gemini_price_plans gp ON gp.id = tx.gemini_price_plan_id
           LEFT JOIN app_settings s ON s.user_id = tx.user_id
           JOIN LATERAL (
             SELECT id, owner_phone_number, phone_number
               FROM bots
              WHERE user_id = tx.user_id
                AND is_online = 1
                AND COALESCE(bot_purpose, 'main') = 'main'
              ORDER BY created_at DESC
              LIMIT 1
           ) b ON true
          WHERE tx.status = 'paid'
            AND (
              (tx.active_expires_at IS NOT NULL
               AND COALESCE(tx.platform, '') <> 'pribadi'
               AND tx.active_expires_at < CURRENT_TIMESTAMP
               AND tx.active_expires_at >= CURRENT_TIMESTAMP - (? * INTERVAL '1 day')
               AND tx.active_exp_notified_at IS NULL)
              OR
              (tx.warranty_expires_at IS NOT NULL
               AND tx.warranty_expires_at < CURRENT_TIMESTAMP
               AND tx.warranty_expires_at >= CURRENT_TIMESTAMP - (? * INTERVAL '1 day')
               AND tx.warranty_exp_notified_at IS NULL)
            )
          ORDER BY tx.active_expires_at NULLS LAST, tx.warranty_expires_at NULLS LAST
          LIMIT 100`,
        [EXPIRY_NOTIFY_LOOKBACK_DAYS, EXPIRY_NOTIFY_LOOKBACK_DAYS],
      );

      let sentCount = 0;
      for (const row of rows) {
        if (this.isPastDate(row.active_expires_at) && !row.active_exp_notified_at) {
          const sent = await this.sendExpiryNotification(pool, row, "active");
          if (sent) sentCount += 1;
        }
        if (this.isPastDate(row.warranty_expires_at) && !row.warranty_exp_notified_at) {
          const sent = await this.sendExpiryNotification(pool, row, "warranty");
          if (sent) sentCount += 1;
        }
      }

      logger.info(`Transaction expiry checked: ${expiredCount} active status updated, ${sentCount} notification sent`);
    } catch (err) {
      logger.error(err, "Transaction expiry notification error");
    }
  }

  async findInterruptedBroadcastRuns(userId) {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT br.id, br.broadcast_id, br.user_id
         FROM broadcast_runs br
         JOIN broadcasts b ON b.id = br.broadcast_id
        WHERE br.user_id = ?
          AND br.status = 'interrupted'
          AND b.is_active = 1
        ORDER BY br.started_at ASC`,
      [Number(userId)],
    );
    return rows;
  }

  async resumeInterruptedBroadcasts(userId) {
    const runs = await this.findInterruptedBroadcastRuns(userId);
    for (const run of runs) {
      await this.executeBroadcast(run.broadcast_id, run.user_id, {
        resumeRunId: Number(run.id),
      });
    }
  }

  async createBroadcastRun(pool, broadcastId, userId, targetGroups) {
    const [result] = await pool.execute(
      `INSERT INTO broadcast_runs (broadcast_id, user_id, status, total_targets, processed_targets)
       VALUES (?, ?, 'running', ?, 0)`,
      [Number(broadcastId), Number(userId), targetGroups.length],
    );
    const runId = Number(result.insertId);

    for (const group of targetGroups) {
      const status = group.isClosed ? "closed" : "pending";
      await pool.execute(
        `INSERT INTO broadcast_run_items
           (run_id, broadcast_id, user_id, group_jid, group_name, status, processed_at)
         VALUES (?, ?, ?, ?, ?, ?, ${status === "closed" ? "CURRENT_TIMESTAMP" : "NULL"})
         ON CONFLICT (run_id, group_jid) DO NOTHING`,
        [
          runId,
          Number(broadcastId),
          Number(userId),
          String(group.group_jid),
          String(group.name ?? group.group_jid ?? "-"),
          status,
        ],
      );
    }

    await this.refreshBroadcastRunProgress(pool, runId);
    return runId;
  }

  async refreshBroadcastRunProgress(pool, runId, finalStatus = null) {
    const [counts] = await pool.execute(
      `SELECT
          COUNT(*) AS total_targets,
          COUNT(*) FILTER (WHERE status IN ('sent', 'closed')) AS processed_targets,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_targets,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed_targets
         FROM broadcast_run_items
        WHERE run_id = ?`,
      [Number(runId)],
    );
    const count = counts[0] ?? {};
    const total = Number(count.total_targets ?? 0);
    const processed = Number(count.processed_targets ?? 0);
    const pending = Number(count.pending_targets ?? 0);
    const failed = Number(count.failed_targets ?? 0);
    const status =
      finalStatus ||
      (pending === 0
        ? failed > 0
          ? "partial"
          : "completed"
        : "running");

    await pool.execute(
      `UPDATE broadcast_runs
          SET total_targets = ?,
              processed_targets = ?,
              status = ?,
              completed_at = CASE WHEN ? IN ('completed', 'partial', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE id = ?`,
      [total, processed, status, status, Number(runId)],
    );

    return { total, processed, pending, failed, status };
  }

  async markBroadcastRunItem(pool, runId, jid, status, errorText = null) {
    await pool.execute(
      `UPDATE broadcast_run_items
          SET status = ?,
              error_text = ?,
              attempt_count = attempt_count + 1,
              processed_at = CASE WHEN ? IN ('sent', 'closed') THEN CURRENT_TIMESTAMP ELSE processed_at END
        WHERE run_id = ?
          AND group_jid = ?`,
      [status, errorText, status, Number(runId), String(jid)],
    );
    return this.refreshBroadcastRunProgress(pool, runId);
  }

  async executeBroadcast(broadcastId, userId, options = {}) {
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
        const clauses = ["b.user_id = ?", "COALESCE(b.bot_purpose, ?) = ?"];
        const params = [userId, "main", "main"];
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
          `SELECT g.id, g.group_jid, g.name, g.is_active FROM \`groups\` g
           JOIN bots b ON b.id = g.bot_id
           WHERE ${clauses.join(" AND ")}`,
          params,
        );
        groups = allActiveGroups.filter((group) => this.isActiveFlag(group.is_active));
        closedGroups = allActiveGroups.filter((group) => !this.isActiveFlag(group.is_active));
      } else {
        const selectedClauses = [
          `g.id IN (${targetGroupIds.map(() => "?").join(",")})`,
          "b.user_id = ?",
          "COALESCE(b.bot_purpose, ?) = ?",
        ];
        const selectedParams = [...targetGroupIds, userId, "main", "main"];

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
        groups = selectedGroups.filter((group) => this.isActiveFlag(group.is_active));
        closedGroups = selectedGroups.filter((group) => !this.isActiveFlag(group.is_active));
      }

      const groupByJid = new Map();
      for (const group of [...groups, ...closedGroups]) {
        const jid = String(group.group_jid ?? "").trim();
        if (!jid) continue;
        groupByJid.set(jid, {
          ...group,
          group_jid: jid,
          isClosed: !this.isActiveFlag(group.is_active),
        });
      }

      const targetGroups = [...groupByJid.values()].filter((group) =>
        this.isGroupJid(group.group_jid),
      );
      if (targetGroups.length === 0) {
        logger.warn(`No valid target groups for broadcast ${broadcastId}`);
        await pool.execute(
          "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
          [
            userId,
            "broadcast_failed",
            `Broadcast "${broadcast.title}" tidak berjalan karena tidak ada group target yang valid`,
          ],
        );
        return;
      }

      let runId = Number(options.resumeRunId) > 0 ? Number(options.resumeRunId) : 0;
      if (!runId) {
        const [interruptedRuns] = await pool.execute(
          `SELECT id
             FROM broadcast_runs
            WHERE broadcast_id = ?
              AND user_id = ?
              AND status = 'interrupted'
            ORDER BY started_at ASC
            LIMIT 1`,
          [Number(broadcastId), Number(userId)],
        );
        runId = Number(interruptedRuns[0]?.id ?? 0);
      }
      if (!runId) {
        runId = await this.createBroadcastRun(pool, broadcastId, userId, targetGroups);
      } else {
        await pool.execute(
          "UPDATE broadcast_runs SET status = 'running' WHERE id = ? AND status = 'interrupted'",
          [runId],
        );
      }

      for (const group of closedGroups) {
        const groupName = String(group.name ?? group.group_jid ?? "-");
        await pool.execute(
          "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
          [
            userId,
            "broadcast_group_closed",
            `Group ${groupName} ditutup dan dianggap sudah di-broadcast jam ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`,
          ],
        );
      }

      const invalidGroups = groups.filter((group) => !this.isGroupJid(group.group_jid));
      for (const group of invalidGroups) {
        logger.warn(
          `Skipping invalid broadcast group JID for broadcast ${broadcastId}: ${group.group_jid}`,
        );
      }

      const [pendingItems] = await pool.execute(
        `SELECT group_jid
           FROM broadcast_run_items
          WHERE run_id = ?
            AND status IN ('pending', 'failed')
          ORDER BY id ASC`,
        [runId],
      );
      const groupJids = pendingItems.map((item) => String(item.group_jid));
      if (groupJids.length === 0) {
        const progress = await this.refreshBroadcastRunProgress(pool, runId);
        await pool.execute(
          "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
          [
            userId,
            "broadcast_sent",
            `Broadcast "${broadcast.title}" selesai ${progress.processed}/${progress.total} group`,
          ],
        );
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

      const groupNameByJid = new Map(
        targetGroups.map((group) => [String(group.group_jid), String(group.name ?? group.group_jid)]),
      );
      const results = await messageService.sendBulkMessages(
        preferredConnection.sock,
        userId,
        groupJids,
        broadcast.message_text,
        broadcast.image_url || null,
        {
          onResult: async (result) => {
            const status =
              result.status === "sent"
                ? "sent"
                : result.status === "group_closed"
                  ? "closed"
                  : result.status === "connection_closed"
                    ? "pending"
                    : "failed";
            const progress = await this.markBroadcastRunItem(
              pool,
              runId,
              result.jid,
              status,
              result.error || null,
            );
            if (status === "sent" || status === "closed") {
              const groupName = groupNameByJid.get(String(result.jid)) ?? String(result.jid);
              await pool.execute(
                "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
                [
                  userId,
                  status === "closed" ? "broadcast_group_closed" : "broadcast_group_sent",
                  status === "closed"
                    ? `Group ${groupName} ditutup dan dianggap sudah di-broadcast (${progress.processed}/${progress.total})`
                    : `Group ${groupName} berhasil di broadcast (${progress.processed}/${progress.total}) jam ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`,
                ],
              );
            }
          },
        },
      );

      const connectionClosed = results.some((r) => r.status === "connection_closed");
      const progress = await this.refreshBroadcastRunProgress(pool, runId);

      if (connectionClosed) {
        await this.refreshBroadcastRunProgress(pool, runId, "interrupted");
        await baileysManager.markBotConnectionClosed(
          preferredConnection.botId,
          userId,
        );
        await pool.execute(
          "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
          [
            userId,
            "broadcast_failed",
            `Broadcast "${broadcast.title}" berhenti karena koneksi bot WhatsApp terputus (${progress.processed}/${progress.total} group sudah diproses). Akan dilanjutkan setelah bot reconnect.`,
          ],
        );
        logger.warn(
          `Broadcast ${broadcastId} stopped because bot ${preferredConnection.phoneNumber ?? preferredConnection.botId} connection closed`,
        );
        return;
      }

      await pool.execute(
        "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
        [
          userId,
          "broadcast_sent",
          `Broadcast "${broadcast.title}" dikirim ke ${progress.processed}/${progress.total} group`,
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
      this.registerTransactionExpiryJob();

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
