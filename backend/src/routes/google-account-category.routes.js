import { Router } from "express";
import {
  createGoogleAccountCategory,
  deleteGoogleAccountCategory,
  listGoogleAccountCategories,
  updateGoogleAccountCategory,
} from "../controllers/google-account-category.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticate, listGoogleAccountCategories);
router.post("/", authenticate, createGoogleAccountCategory);
router.put("/:categoryId", authenticate, updateGoogleAccountCategory);
router.delete("/:categoryId", authenticate, deleteGoogleAccountCategory);

export default router;
