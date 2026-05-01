import { Router } from "express";
import {
  pakasirWebhook,
  pakasirWebhookInfo,
} from "../controllers/cs-payment.controller.js";

const router = Router();

router.get("/pakasir/webhook", pakasirWebhookInfo);
router.post("/pakasir/webhook", pakasirWebhook);
router.get("/webhook/pakasir", pakasirWebhookInfo);
router.post("/webhook/pakasir", pakasirWebhook);

export default router;
