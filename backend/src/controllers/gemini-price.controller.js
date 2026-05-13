import { geminiPriceService } from "../services/gemini-price.service.js";
import { realtimeService } from "../services/realtime.service.js";
import { logger } from "../utils/logger.js";

export async function listGeminiPrices(req, res) {
  try {
    const items = await geminiPriceService.listForUser(req.user);
    res.json({ items });
  } catch (err) {
    logger.error(err, "List gemini prices error");
    res.status(500).json({ error: "Gagal memuat harga Gemini" });
  }
}

export async function createGeminiPrice(req, res) {
  try {
    const item = await geminiPriceService.createForUser(req.user, req.body);
    realtimeService.emitTrxGeminiChanged(req.user.id, { source: "gemini_price_create" });
    res.status(201).json({ message: "Harga Gemini berhasil disimpan", item });
  } catch (err) {
    logger.error(err, "Create gemini price error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal menyimpan harga Gemini" });
  }
}

export async function updateGeminiPrice(req, res) {
  try {
    const item = await geminiPriceService.updateForUser(req.user, req.params.priceId, req.body);
    realtimeService.emitTrxGeminiChanged(req.user.id, { source: "gemini_price_update" });
    res.json({ message: "Harga Gemini berhasil diperbarui", item });
  } catch (err) {
    logger.error(err, "Update gemini price error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal memperbarui harga Gemini" });
  }
}

export async function deleteGeminiPrice(req, res) {
  try {
    const ok = await geminiPriceService.deleteForUser(req.user, req.params.priceId);
    if (!ok) return res.status(404).json({ error: "Harga Gemini tidak ditemukan" });
    realtimeService.emitTrxGeminiChanged(req.user.id, { source: "gemini_price_delete" });
    res.json({ message: "Harga Gemini berhasil dihapus" });
  } catch (err) {
    logger.error(err, "Delete gemini price error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal menghapus harga Gemini" });
  }
}
