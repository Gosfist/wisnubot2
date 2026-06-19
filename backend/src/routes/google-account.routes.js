import { Router } from "express";
import {
  createGoogleAccount,
  deleteGoogleAccount,
  listGoogleAccounts,
  updateGoogleAccount,
  updateGoogleAccountSuspend,
} from "../controllers/google-account.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticate, listGoogleAccounts);
router.post("/", authenticate, createGoogleAccount);
router.put("/:accountId", authenticate, updateGoogleAccount);
router.patch("/:accountId/suspend", authenticate, updateGoogleAccountSuspend);
router.delete("/:accountId", authenticate, deleteGoogleAccount);

export default router;
