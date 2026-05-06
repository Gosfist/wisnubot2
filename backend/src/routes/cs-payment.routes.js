import { Router } from "express";
import {
  deleteTransaction,
  listPaidTransactions,
  pakasirWebhook,
  pakasirWebhookInfo,
  updateTransaction,
} from "../controllers/cs-payment.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/transactions", authenticate, listPaidTransactions);
router.put("/transactions/:transactionId", authenticate, updateTransaction);
router.delete("/transactions/:transactionId", authenticate, deleteTransaction);
router.get("/pakasir/webhook", pakasirWebhookInfo);
router.post("/pakasir/webhook", pakasirWebhook);
router.get("/webhook/pakasir", pakasirWebhookInfo);
router.post("/webhook/pakasir", pakasirWebhook);

export default router;
