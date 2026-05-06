import { baileysManager } from "../services/baileys.service.js";
import { csPaymentService } from "../services/cs-payment.service.js";
import { logger } from "../utils/logger.js";

export function pakasirWebhookInfo(req, res) {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  const baseUrl = host ? `${protocol}://${host}` : "";

  res.json({
    message: "Webhook Pakasir aktif",
    method: "POST",
    webhookUrl: `${baseUrl}/api/cs-payments/pakasir/webhook`,
    aliasUrl: `${baseUrl}/api/cs-payments/webhook/pakasir`,
    expectedBody: {
      amount: 22000,
      order_id: "240910HDE7C9",
      project: "slug-pakasir",
      status: "completed",
      payment_method: "qris",
      completed_at: "2024-09-10T08:07:02.819+07:00",
    },
  });
}

export async function pakasirWebhook(req, res) {
  try {
    logger.info(
      {
        orderId: req.body?.order_id ?? req.body?.orderId,
        amount: req.body?.amount,
        project: req.body?.project,
        status: req.body?.status,
        paymentMethod: req.body?.payment_method ?? req.body?.paymentMethod,
      },
      "Pakasir webhook received",
    );

    const result = await csPaymentService.handleWebhookAndDeliver(
      req.body,
      (userId) => baileysManager.getSocket(userId),
    );

    res.json({
      message: result.paid ? "Pembayaran diproses" : "Webhook diterima",
      paid: result.paid,
      reason: result.reason,
    });
  } catch (err) {
    logger.error(err, "Pakasir webhook error");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Payload tidak valid",
    });
  }
}

export async function listPaidTransactions(req, res) {
  try {
    const items = await csPaymentService.listPaidTransactionsForUser(req.user);
    res.json({ items });
  } catch (err) {
    logger.error(err, "List paid transactions error");
    res.status(500).json({ error: "Gagal memuat transaksi" });
  }
}

export async function updateTransaction(req, res) {
  try {
    const item = await csPaymentService.updateTransactionForUser(
      req.user,
      req.params.transactionId,
      req.body,
    );
    res.json({ message: "Transaksi berhasil diperbarui", item });
  } catch (err) {
    logger.error(err, "Update transaction error");
    res.status(400).json({ error: err instanceof Error ? err.message : "Gagal memperbarui transaksi" });
  }
}

export async function deleteTransaction(req, res) {
  try {
    const ok = await csPaymentService.deleteTransactionForUser(
      req.user,
      req.params.transactionId,
    );
    if (!ok) return res.status(404).json({ error: "Transaksi tidak ditemukan" });
    res.json({ message: "Transaksi berhasil dihapus" });
  } catch (err) {
    logger.error(err, "Delete transaction error");
    res.status(500).json({ error: "Gagal menghapus transaksi" });
  }
}
