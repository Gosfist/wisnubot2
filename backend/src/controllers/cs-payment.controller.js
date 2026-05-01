import { baileysManager } from "../services/baileys.service.js";
import { csPaymentService } from "../services/cs-payment.service.js";
import { logger } from "../utils/logger.js";

export async function pakasirWebhook(req, res) {
  try {
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
