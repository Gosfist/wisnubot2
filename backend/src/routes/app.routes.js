import { Router } from "express";

const router = Router();

router.get("/config", (_req, res) => {
  res.json({ status: "ok", app: "wisnubot2" });
});

export default router;
