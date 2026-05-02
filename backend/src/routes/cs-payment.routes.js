import { Router } from "express";
import {
  listPaidTransactions,
  pakasirWebhook,
  pakasirWebhookInfo,
} from "../controllers/cs-payment.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/transactions", authenticate, listPaidTransactions);
router.get("/pakasir/webhook", pakasirWebhookInfo);
router.post("/pakasir/webhook", pakasirWebhook);
router.get("/webhook/pakasir", pakasirWebhookInfo);
router.post("/webhook/pakasir", pakasirWebhook);

export default router;
