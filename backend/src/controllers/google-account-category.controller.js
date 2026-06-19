import { googleAccountCategoryService } from "../services/google-account-category.service.js";
import { realtimeService } from "../services/realtime.service.js";
import { logger } from "../utils/logger.js";

export async function listGoogleAccountCategories(req, res) {
  try {
    const items = await googleAccountCategoryService.listForUser(req.user);
    res.json({ items });
  } catch (err) {
    logger.error(err, "List google account categories error");
    res.status(500).json({ error: "Gagal memuat kategori" });
  }
}

export async function createGoogleAccountCategory(req, res) {
  try {
    const item = await googleAccountCategoryService.createForUser(req.user, req.body);
    realtimeService.emitTrxGeminiChanged(req.user.id, { source: "google_account_category_create" });
    res.status(201).json({ message: "Kategori berhasil disimpan", item });
  } catch (err) {
    logger.error(err, "Create google account category error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal menyimpan kategori" });
  }
}

export async function updateGoogleAccountCategory(req, res) {
  try {
    const item = await googleAccountCategoryService.updateForUser(req.user, req.params.categoryId, req.body);
    realtimeService.emitTrxGeminiChanged(req.user.id, { source: "google_account_category_update" });
    res.json({ message: "Kategori berhasil diubah", item });
  } catch (err) {
    logger.error(err, "Update google account category error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal mengubah kategori" });
  }
}

export async function deleteGoogleAccountCategory(req, res) {
  try {
    const ok = await googleAccountCategoryService.deleteForUser(req.user, req.params.categoryId);
    if (!ok) return res.status(404).json({ error: "Kategori tidak ditemukan" });
    realtimeService.emitTrxGeminiChanged(req.user.id, { source: "google_account_category_delete" });
    res.json({ message: "Kategori berhasil dihapus" });
  } catch (err) {
    logger.error(err, "Delete google account category error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal menghapus kategori" });
  }
}
