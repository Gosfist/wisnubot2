import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { getPool } from "../config/database.js";

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token tidak ditemukan" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT id, username, is_active FROM users WHERE id = ? LIMIT 1",
      [decoded.id],
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "User tidak ditemukan" });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: "Akun Anda telah dinonaktifkan" });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: "owner",
    };
    next();
  } catch {
    return res.status(401).json({ error: "Token tidak valid atau expired" });
  }
}
