import { csStockService } from "../services/cs-stock.service.js";
import { logger } from "../utils/logger.js";

export async function listStocks(req, res) {
  try {
    const csId = Number(req.params.csId);
    const items = await csStockService.listForCs(req.user, csId);
    res.json({ items });
  } catch (err) {
    logger.error(err, "List stocks error");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Request tidak valid",
    });
  }
}

export async function summary(req, res) {
  try {
    const items = await csStockService.summaryForUser(req.user);
    res.json({ items });
  } catch (err) {
    logger.error(err, "Summary stocks error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function addStocks(req, res) {
  try {
    const csId = Number(req.params.csId);
    const result = await csStockService.addStocks(
      req.user,
      csId,
      req.body?.contents ?? req.body?.text,
    );
    res.status(201).json({
      message: `${result.added} stock berhasil ditambahkan`,
      ...result,
    });
  } catch (err) {
    logger.error(err, "Add stocks error");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Request tidak valid",
    });
  }
}

export async function deleteStock(req, res) {
  try {
    const stockId = Number(req.params.stockId);
    const ok = await csStockService.deleteStock(req.user, stockId);
    if (!ok) {
      return res.status(404).json({ error: "Stock tidak ditemukan" });
    }
    res.json({ message: "Stock berhasil dihapus" });
  } catch (err) {
    logger.error(err, "Delete stock error");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Request tidak valid",
    });
  }
}

export async function clearStocks(req, res) {
  try {
    const csId = Number(req.params.csId);
    const removed = await csStockService.deleteAllForCs(req.user, csId);
    res.json({ message: `${removed} stock dihapus`, removed });
  } catch (err) {
    logger.error(err, "Clear stocks error");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Request tidak valid",
    });
  }
}
