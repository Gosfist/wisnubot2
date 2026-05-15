import { Router } from "express";
import {
  addStocks,
  clearStocks,
  deleteStock,
  listStocks,
  summary,
  updateStock,
} from "../controllers/cs-stock.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

router.get("/summary", summary);
router.get("/cs/:csId", listStocks);
router.post("/cs/:csId", addStocks);
router.delete("/cs/:csId", clearStocks);
router.put("/:stockId", updateStock);
router.delete("/:stockId", deleteStock);

export default router;
