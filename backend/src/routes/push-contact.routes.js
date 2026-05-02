import { Router } from "express";
import { body } from "express-validator";
import {
  createTemplate,
  deleteTemplate,
  getStatus,
  listTemplates,
  startPush,
  updateTemplate,
} from "../controllers/push-contact.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.use(authenticate);

router.get("/status", getStatus);
router.get("/templates", listTemplates);
router.post(
  "/templates",
  [
    body("title").trim().notEmpty().withMessage("Nama template wajib diisi"),
    body("messageText").trim().notEmpty().withMessage("Text template wajib diisi"),
    validate,
  ],
  createTemplate,
);
router.delete("/templates/:templateId", deleteTemplate);
router.put(
  "/templates/:templateId",
  [
    body("title").trim().notEmpty().withMessage("Nama template wajib diisi"),
    body("messageText").trim().notEmpty().withMessage("Text template wajib diisi"),
    validate,
  ],
  updateTemplate,
);
router.post(
  "/run",
  [
    body("templateId").notEmpty().withMessage("Template wajib dipilih"),
    body("groupId").notEmpty().withMessage("Group wajib dipilih"),
    validate,
  ],
  startPush,
);

export default router;
