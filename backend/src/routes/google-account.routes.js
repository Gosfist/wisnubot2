import { Router } from "express";
import {
  createGoogleAccount,
  listGoogleAccounts,
} from "../controllers/google-account.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticate, listGoogleAccounts);
router.post("/", authenticate, createGoogleAccount);

export default router;
