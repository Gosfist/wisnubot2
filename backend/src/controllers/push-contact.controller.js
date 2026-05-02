import { pushContactService } from "../services/push-contact.service.js";
import { logger } from "../utils/logger.js";

function handleError(res, err, fallback = "Request tidak valid") {
  res.status(400).json({ error: err instanceof Error ? err.message : fallback });
}

export async function listTemplates(req, res) {
  try {
    const items = await pushContactService.listTemplates(req.user);
    res.json({ items });
  } catch (err) {
    logger.error(err, "List push contact templates error");
    res.status(500).json({ error: "Gagal memuat template" });
  }
}

export async function createTemplate(req, res) {
  try {
    const item = await pushContactService.createTemplate(req.user, req.body);
    res.json({ message: "Template berhasil dibuat", item });
  } catch (err) {
    handleError(res, err);
  }
}

export async function updateTemplate(req, res) {
  try {
    const item = await pushContactService.updateTemplate(
      req.user,
      req.params.templateId,
      req.body,
    );
    res.json({ message: "Template berhasil diperbarui", item });
  } catch (err) {
    handleError(res, err);
  }
}

export async function deleteTemplate(req, res) {
  try {
    const ok = await pushContactService.deleteTemplate(req.user, req.params.templateId);
    if (!ok) return res.status(404).json({ error: "Template tidak ditemukan" });
    res.json({ message: "Template berhasil dihapus" });
  } catch (err) {
    handleError(res, err);
  }
}

export async function getStatus(req, res) {
  try {
    const result = await pushContactService.getStatus(req.user);
    res.json(result);
  } catch (err) {
    logger.error(err, "Push contact status error");
    res.status(500).json({ error: "Gagal memuat status push kontak" });
  }
}

export async function startPush(req, res) {
  try {
    const result = await pushContactService.startPush(req.user, req.body);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
}
