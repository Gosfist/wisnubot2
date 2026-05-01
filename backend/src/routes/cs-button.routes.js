import { Router } from "express";
import {
  listButtons,
  replaceButtons,
} from "../controllers/cs-button.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/:csId", listButtons);
router.put("/:csId", replaceButtons);

export default router;
