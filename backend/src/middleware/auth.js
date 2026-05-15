import { getPool } from "../config/database.js";
import { getSessionTokenFromRequest, verifySessionToken } from "../services/auth-session.service.js";

export async function getAuthenticatedUserFromToken(token) {
  const decoded = verifySessionToken(token);
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT id, username, is_active FROM users WHERE id = ? LIMIT 1",
    [decoded.id],
  );

  if (rows.length === 0) {
    const error = new Error("User tidak ditemukan");
    error.status = 401;
    throw error;
  }

  const user = rows[0];
  if (!user.is_active) {
    const error = new Error("Akun Anda telah dinonaktifkan");
    error.status = 403;
    throw error;
  }

  return {
    id: user.id,
    username: user.username,
    role: "owner",
    csrf: decoded.csrf,
  };
}

export async function authenticate(req, res, next) {
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "Token tidak ditemukan" });
  }

  try {
    req.user = await getAuthenticatedUserFromToken(token);
    next();
  } catch (err) {
    return res.status(err.status || 401).json({
      error: err.status === 403 ? err.message : "Token tidak valid atau expired",
    });
  }
}
