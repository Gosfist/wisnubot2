import { Router } from "express";
import { body } from "express-validator";
import {
  login,
  logout,
  me,
  updateProfile,
  changePassword,
  verifyResetSecret,
  resetPassword,
} from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { loginLimiter, resetSecretLimiter } from "../middleware/rate-limiters.js";

const router = Router();

router.post(
  "/login",
  loginLimiter,
  [
    body("username").trim().notEmpty().withMessage("Username wajib diisi"),
    body("password").notEmpty().withMessage("Password wajib diisi"),
    validate,
  ],
  login,
);

router.post("/logout", authenticate, logout);

router.get("/me", authenticate, me);

router.put(
  "/profile",
  authenticate,
  [
    body("username").trim().notEmpty().withMessage("Username baru wajib diisi"),
    body("secretKey").trim().notEmpty().withMessage("Secret key wajib diisi"),
    validate,
  ],
  updateProfile,
);

router.post(
  "/change-password",
  authenticate,
  [
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password baru minimal 8 karakter"),
    body("secretKey").trim().notEmpty().withMessage("Secret key wajib diisi"),
    validate,
  ],
  changePassword,
);

router.post(
  "/verify-reset-secret",
  resetSecretLimiter,
  [
    body("secretKey").trim().notEmpty().withMessage("Secret key wajib diisi"),
    validate,
  ],
  verifyResetSecret,
);

router.post(
  "/reset-password",
  resetSecretLimiter,
  [
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password baru minimal 8 karakter"),
    body("confirmPassword").notEmpty().withMessage("Konfirmasi password wajib diisi"),
    body("secretKey").trim().notEmpty().withMessage("Secret key wajib diisi"),
    validate,
  ],
  resetPassword,
);

export default router;
