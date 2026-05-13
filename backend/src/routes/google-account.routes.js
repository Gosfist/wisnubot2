import { Router } from "express";
import {
  createGoogleAccount,
  deleteGoogleAccount,
  listGoogleAccounts,
} from "../controllers/google-account.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticate, listGoogleAccounts);
router.post("/", authenticate, createGoogleAccount);
router.delete("/:accountId", authenticate, deleteGoogleAccount);

export default router;
