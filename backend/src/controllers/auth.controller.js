import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getPool } from "../config/database.js";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";

function toAuthUserResponse(user) {
  return {
    id: user.id,
    username: user.username,
    created_at: user.created_at,
  };
}

export async function login(req, res) {
  try {
    const username = String(req.body.username ?? "").trim();
    const { password } = req.body;
    const pool = getPool();

    if (!username || !password) {
      return res.status(400).json({ error: "Username dan password wajib diisi" });
    }

    const [rows] = await pool.execute(
      "SELECT id, username, `password`, is_active, created_at FROM users WHERE username = ? LIMIT 1",
      [username],
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Username atau password salah" });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: "Akun Anda telah dinonaktifkan" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Username atau password salah" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      config.jwtSecret,
      { expiresIn: "30d" },
    );

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [user.id, "login", `Login dari ${req.ip}`],
    );

    logger.info(`Admin logged in: ${user.username}`);

    res.json({
      message: "Login berhasil",
      token,
      user: toAuthUserResponse(user),
    });
  } catch (err) {
    logger.error(err, "Login error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function logout(req, res) {
  try {
    const pool = getPool();
    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [req.user.id, "logout", `Logout dari ${req.ip}`],
    );
    res.json({ message: "Logout berhasil" });
  } catch (err) {
    logger.error(err, "Logout error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function me(req, res) {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT id, username, created_at FROM users WHERE id = ? LIMIT 1",
      [req.user.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User tidak ditemukan" });
    }

    res.json({ user: toAuthUserResponse(rows[0]) });
  } catch (err) {
    logger.error(err, "Get current user error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function updateProfile(req, res) {
  try {
    const newUsername = String(req.body.username ?? "").trim();
    const secretKey = String(req.body.secretKey ?? "").trim();
    const pool = getPool();

    if (!newUsername) {
      return res.status(400).json({ error: "Username baru wajib diisi" });
    }

    if (secretKey !== config.resetSecret) {
      return res.status(403).json({ error: "Secret key tidak valid" });
    }

    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1",
      [newUsername, req.user.id],
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Username sudah digunakan" });
    }

    await pool.execute("UPDATE users SET username = ? WHERE id = ?", [
      newUsername,
      req.user.id,
    ]);

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [req.user.id, "update_profile", `Ganti username ke ${newUsername}`],
    );

    res.json({ message: "Username berhasil diperbarui" });
  } catch (err) {
    logger.error(err, "Update profile error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function changePassword(req, res) {
  try {
    const { newPassword, secretKey } = req.body;
    const pool = getPool();

    if (!newPassword || newPassword.length < 3) {
      return res.status(400).json({ error: "Password baru minimal 3 karakter" });
    }

    if (String(secretKey ?? "").trim() !== config.resetSecret) {
      return res.status(403).json({ error: "Secret key tidak valid" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.execute("UPDATE users SET `password` = ? WHERE id = ?", [
      hash,
      req.user.id,
    ]);

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [req.user.id, "change_password", "Admin mengganti password akun"],
    );

    res.json({ message: "Password berhasil diubah" });
  } catch (err) {
    logger.error(err, "Change password error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function resetPassword(req, res) {
  try {
    const { newPassword, confirmPassword, secretKey } = req.body;

    if (!newPassword || newPassword.length < 3) {
      return res.status(400).json({ error: "Password baru minimal 3 karakter" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Konfirmasi password tidak cocok" });
    }

    if (String(secretKey ?? "").trim() !== config.resetSecret) {
      return res.status(403).json({ error: "Secret key tidak valid" });
    }

    const pool = getPool();
    const [rows] = await pool.execute("SELECT id FROM users LIMIT 1");

    if (rows.length === 0) {
      return res.status(404).json({ error: "Admin tidak ditemukan" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.execute("UPDATE users SET `password` = ? WHERE id = ?", [
      hash,
      rows[0].id,
    ]);

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [rows[0].id, "reset_password", "Reset password via secret key"],
    );

    res.json({ message: "Password berhasil direset" });
  } catch (err) {
    logger.error(err, "Reset password error");
    res.status(500).json({ error: "Server error" });
  }
}
