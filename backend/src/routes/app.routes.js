import { Router } from "express";
import { getPool } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/config", (_req, res) => {
  res.json({ status: "ok", app: "wisnubot2" });
});

router.get("/activity", authenticate, async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, action, detail, created_at
       FROM activity_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20`,
    [Number(req.user.id)],
  );
  res.json({
    items: rows.map((row) => ({
      id: Number(row.id),
      action: String(row.action ?? ""),
      detail: String(row.detail ?? ""),
      createdAt: row.created_at ? String(row.created_at) : null,
    })),
  });
});

export default router;
