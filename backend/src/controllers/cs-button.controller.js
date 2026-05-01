import { csButtonService } from "../services/cs-button.service.js";
import { logger } from "../utils/logger.js";

export async function listButtons(req, res) {
  try {
    const csId = Number(req.params.csId);
    const items = await csButtonService.listForCs(csId);
    res.json({ items });
  } catch (err) {
    logger.error(err, "List CS buttons error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function replaceButtons(req, res) {
  try {
    const csId = Number(req.params.csId);
    const items = await csButtonService.replaceForCs(
      req.user,
      csId,
      req.body?.buttons,
    );
    res.json({ message: "Button berhasil disimpan", items });
  } catch (err) {
    logger.error(err, "Replace CS buttons error");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Request tidak valid",
    });
  }
}
