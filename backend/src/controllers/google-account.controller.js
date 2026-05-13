import { googleAccountService } from "../services/google-account.service.js";
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
    res.status(201).json({ message: "Google Account berhasil disimpan", item });
  } catch (err) {
    logger.error(err, "Create google account error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal menyimpan Google Account" });
  }
}
