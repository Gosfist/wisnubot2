import { Router } from "express";
import {
  createGeminiPrice,
  deleteGeminiPrice,
  listGeminiPrices,
  updateGeminiPrice,
} from "../controllers/gemini-price.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticate, listGeminiPrices);
router.post("/", authenticate, createGeminiPrice);
router.put("/:priceId", authenticate, updateGeminiPrice);
router.delete("/:priceId", authenticate, deleteGeminiPrice);

export default router;
