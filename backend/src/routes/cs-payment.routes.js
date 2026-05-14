import { Router } from "express";
import {
  createManualTransaction,
  deleteTransaction,
  listPaidTransactions,
  pakasirWebhook,
  pakasirWebhookInfo,
  updateTransactionReport,
  updateTransaction,
} from "../controllers/cs-payment.controller.js";
import { authenticate } from "../middleware/auth.js";
import { proofImageUploadMiddleware } from "../middleware/upload.js";

const router = Router();

router.get("/transactions", authenticate, listPaidTransactions);
router.post("/transactions", authenticate, proofImageUploadMiddleware, createManualTransaction);
router.patch("/transactions/:transactionId/report", authenticate, updateTransactionReport);
router.put("/transactions/:transactionId", authenticate, updateTransaction);
router.delete("/transactions/:transactionId", authenticate, deleteTransaction);
router.get("/pakasir/webhook", pakasirWebhookInfo);
router.post("/pakasir/webhook", pakasirWebhook);
router.get("/webhook/pakasir", pakasirWebhookInfo);
router.post("/webhook/pakasir", pakasirWebhook);

export default router;
