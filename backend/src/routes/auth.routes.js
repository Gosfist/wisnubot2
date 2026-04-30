import { Router } from "express";
import { body } from "express-validator";
import {
  login,
  logout,
  me,
  updateProfile,
  changePassword,
  resetPassword,
} from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.post(
  "/login",
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
    body("newPassword").notEmpty().withMessage("Password baru wajib diisi"),
    body("secretKey").trim().notEmpty().withMessage("Secret key wajib diisi"),
    validate,
  ],
  changePassword,
);

router.post(
  "/reset-password",
  [
    body("newPassword").notEmpty().withMessage("Password baru wajib diisi"),
    body("confirmPassword").notEmpty().withMessage("Konfirmasi password wajib diisi"),
    body("secretKey").trim().notEmpty().withMessage("Secret key wajib diisi"),
    validate,
  ],
  resetPassword,
);

export default router;
