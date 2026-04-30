import { Router } from "express";
import {
  listBroadcasts,
  getBroadcastNameSignature,
  createBroadcast,
  updateBroadcast,
  deleteBroadcast,
} from "../controllers/broadcast.controller.js";
import { broadcastUploadMiddleware } from "../middleware/upload.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

router.get("/", listBroadcasts);
router.get("/name-signature", getBroadcastNameSignature);

// Image upload is handled via multipart/form-data — multer runs first, then controller
router.post("/", broadcastUploadMiddleware, createBroadcast);
router.put("/:broadcastId", broadcastUploadMiddleware, updateBroadcast);
router.delete("/:broadcastId", deleteBroadcast);

export default router;
