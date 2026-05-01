import { appSettingsService } from "../services/app-settings.service.js";
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
    });
    res.json({ message: "Pengaturan berhasil disimpan", settings });
  } catch (err) {
    logger.error(err, "Update settings error");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Request tidak valid",
    });
  }
}
