import { Router } from "express";
import { body } from "express-validator";
import {
  getSettings,
  updateSettings,
} from "../controllers/settings.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();
router.use(authenticate);

router.get("/", getSettings);
router.put(
  "/",
  [
    body("pakasirSlug").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
    body("pakasirApiKey").optional({ values: "falsy" }).isString().isLength({ max: 255 }),
    validate,
  ],
  updateSettings,
);

export default router;
