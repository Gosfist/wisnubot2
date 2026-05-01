import { Router } from "express";
import { pakasirWebhook } from "../controllers/cs-payment.controller.js";

const router = Router();

router.post("/pakasir/webhook", pakasirWebhook);

export default router;
