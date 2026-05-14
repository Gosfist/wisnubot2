import { appSettingsService } from "../services/app-settings.service.js";
import { baileysManager } from "../services/baileys.service.js";
import { dbTransferService } from "../services/db-transfer.service.js";
import { logger } from "../utils/logger.js";

export async function getSettings(req, res) {
  try {
    const settings = await appSettingsService.getForUser(req.user);
    res.json({ settings });
  } catch (err) {
    logger.error(err, "Get settings error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function updateSettings(req, res) {
  try {
    const settings = await appSettingsService.upsertForUser(req.user, {
      pakasirSlug: req.body?.pakasirSlug,
      pakasirApiKey: req.body?.pakasirApiKey,
      testimonialChannelLink: req.body?.testimonialChannelLink,
      googleDriveCredentialsJson: req.body?.googleDriveCredentialsJson,
      googleDriveFolderId: req.body?.googleDriveFolderId,
    }, {
      sock: baileysManager.getSocket(req.user.id),
    });
    res.json({ message: "Pengaturan berhasil disimpan", settings });
  } catch (err) {
    logger.error(err, "Update settings error");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Request tidak valid",
    });
  }
}

export async function exportDatabase(req, res) {
  try {
    const payload = await dbTransferService.exportForUser(req.user);
    const dateKey = new Date().toISOString().slice(0, 10);
    const username = String(req.user.username ?? "user").replace(/[^a-z0-9_-]+/gi, "-");
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="wisnubot2-full-db-${username}-${dateKey}.json"`,
    );
    res.json(payload);
  } catch (err) {
    logger.error(err, "Export database error");
    res.status(500).json({ error: "Gagal export database" });
  }
}

export async function importDatabase(req, res) {
  try {
    const result = await dbTransferService.importForUser(req.user, req.body);
    res.json({
      message: "Import database berhasil",
      ...result,
    });
  } catch (err) {
    logger.error(err, "Import database error");
    res.status(400).json({
      error: err instanceof Error ? err.message : "File import tidak valid",
    });
  }
}
