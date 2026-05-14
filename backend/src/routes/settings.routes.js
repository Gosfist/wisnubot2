import { Router } from "express";
import { body } from "express-validator";
import {
  createGoogleDriveOAuthUrl,
  exportDatabase,
  getSettings,
  handleGoogleDriveOAuthCallback,
  importDatabase,
  updateSettings,
} from "../controllers/settings.controller.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/google-drive/oauth/callback", handleGoogleDriveOAuthCallback);

router.use(authenticate);

router.get("/", getSettings);
router.get("/export", exportDatabase);
router.post("/import", importDatabase);
router.post(
  "/google-drive/oauth-url",
  [
    body("clientId").optional({ values: "falsy" }).isString().isLength({ max: 500 }),
    body("clientSecret").optional({ values: "falsy" }).isString().isLength({ max: 500 }),
    body("targetOrigin").optional({ values: "falsy" }).isString().isLength({ max: 500 }),
    validate,
  ],
  createGoogleDriveOAuthUrl,
);
router.put(
  "/",
  [
    body("pakasirSlug").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
    body("pakasirApiKey").optional({ values: "falsy" }).isString().isLength({ max: 255 }),
    body("testimonialChannelLink").optional({ values: "falsy" }).isString().isLength({ max: 500 }),
    body("contactOwnerPhoneNumber").optional({ values: "falsy" }).isString().isLength({ max: 30 }),
    body("botInfoPhoneNumber").optional({ values: "falsy" }).isString().isLength({ max: 30 }),
    body("transactionMessageTemplate").optional({ values: "falsy" }).isString().isLength({ max: 5000 }),
    body("googleDriveCredentialsJson").optional({ values: "falsy" }).isString().isLength({ max: 20000 }),
    body("googleDriveClientId").optional({ values: "falsy" }).isString().isLength({ max: 500 }),
    body("googleDriveClientSecret").optional({ values: "falsy" }).isString().isLength({ max: 500 }),
    body("googleDriveRefreshToken").optional({ values: "falsy" }).isString().isLength({ max: 2000 }),
    body("googleDriveFolderId").optional({ values: "falsy" }).isString().isLength({ max: 255 }),
    validate,
  ],
  updateSettings,
);

export default router;
