import { Router } from "express";
import {
  getAdminStats,
  testBroadcastBot,
} from "../controllers/owner.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

router.get("/stats", getAdminStats);
router.post("/testing/broadcast", testBroadcastBot);

export default router;
