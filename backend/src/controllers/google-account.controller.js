import { googleAccountService } from "../services/google-account.service.js";
import { realtimeService } from "../services/realtime.service.js";
import { logger } from "../utils/logger.js";

export async function listGoogleAccounts(req, res) {
  try {
    const items = await googleAccountService.listForUser(req.user);
    res.json({ items });
  } catch (err) {
    logger.error(err, "List google accounts error");
    res.status(500).json({ error: "Gagal memuat Google Account" });
  }
}

export async function createGoogleAccount(req, res) {
  try {
    const item = await googleAccountService.createForUser(req.user, req.body);
    realtimeService.emitTrxGeminiChanged(req.user.id, { source: "google_account_create" });
    res.status(201).json({ message: "Google Account berhasil disimpan", item });
  } catch (err) {
    logger.error(err, "Create google account error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal menyimpan Google Account" });
  }
}

export async function updateGoogleAccountSuspend(req, res) {
  try {
    const suspended = Boolean(req.body?.suspended ?? req.body?.isSuspended);
    const item = await googleAccountService.setSuspendedForUser(
      req.user,
      req.params.accountId,
      suspended,
    );
    realtimeService.emitTrxGeminiChanged(req.user.id, { source: "google_account_suspend" });
    res.json({
      message: suspended ? "Google Account berhasil di-suspend" : "Google Account berhasil di-unsuspend",
      item,
    });
  } catch (err) {
    logger.error(err, "Update google account suspend error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal mengubah status Google Account" });
  }
}

export async function deleteGoogleAccount(req, res) {
  try {
    const ok = await googleAccountService.deleteForUser(req.user, req.params.accountId);
    if (!ok) return res.status(404).json({ error: "Google Account tidak ditemukan" });
    realtimeService.emitTrxGeminiChanged(req.user.id, { source: "google_account_delete" });
    res.json({ message: "Google Account berhasil dihapus" });
  } catch (err) {
    logger.error(err, "Delete google account error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal menghapus Google Account" });
  }
}
