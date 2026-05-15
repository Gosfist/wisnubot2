import bcrypt from "bcrypt";
import { getPool } from "../config/database.js";
import { config } from "../config/env.js";
import { baileysManager } from "../services/baileys.service.js";
import { clearAuthCookies, setAuthCookies } from "../services/auth-session.service.js";
import { logSecurityEvent } from "../services/security-event.service.js";
import { logger } from "../utils/logger.js";

function toAuthUserResponse(user) {
  return {
    id: user.id,
    username: user.username,
    created_at: user.created_at,
  };
}

function normalizeWhatsappJid(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return `${digits}@s.whatsapp.net`;
  if (digits.startsWith("0") && digits.length > 1) return `62${digits.slice(1)}@s.whatsapp.net`;
  if (digits.startsWith("8")) return `62${digits}@s.whatsapp.net`;
  return `${digits}@s.whatsapp.net`;
}

function getLockedUntilDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isLocked(user) {
  const lockedUntil = getLockedUntilDate(user.locked_until);
  return Boolean(lockedUntil && lockedUntil.getTime() > Date.now());
}

function formatJakartaDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function notifyLoginLockoutOwner({ pool, user, req, lockedUntil, failedCount }) {
  try {
    const [rows] = await pool.execute(
      `SELECT b.id AS bot_id, b.phone_number, s.bot_info_phone_number
         FROM bots b
         LEFT JOIN app_settings s ON s.user_id = b.user_id
        WHERE b.user_id = ?
          AND b.is_online = 1
          AND COALESCE(b.bot_purpose, 'main') = 'main'
        ORDER BY b.created_at DESC
        LIMIT 1`,
      [user.id],
    );
    const bot = rows[0] ?? null;
    const ownerJid = normalizeWhatsappJid(bot?.bot_info_phone_number);

    if (!bot || !ownerJid) {
      await logSecurityEvent(pool, {
        userId: user.id,
        username: user.username,
        eventType: "login_lockout_notification_skipped",
        req,
        detail: "Bot utama online atau nomor Info Bot tidak tersedia",
      });
      return;
    }

    const sock = baileysManager.getSocketForBot(bot.bot_id);
    if (!sock) {
      await logSecurityEvent(pool, {
        userId: user.id,
        username: user.username,
        eventType: "login_lockout_notification_skipped",
        req,
        detail: `Socket bot ${bot.bot_id} sedang offline`,
      });
      return;
    }

    const message = [
      "Peringatan keamanan WisnuBot2",
      "",
      `Akun: ${user.username}`,
      `IP: ${req.ip || "-"}`,
      `User-Agent: ${req.get("user-agent") || "-"}`,
      `Gagal login: ${failedCount}x`,
      `Terkunci sampai: ${formatJakartaDate(lockedUntil)} WIB`,
    ].join("\n");

    await sock.sendMessage(ownerJid, { text: message });
    await logSecurityEvent(pool, {
      userId: user.id,
      username: user.username,
      eventType: "login_lockout_notification_sent",
      req,
      detail: `Notifikasi lockout dikirim ke Info Bot ${bot.bot_info_phone_number}`,
    });
  } catch (err) {
    logger.warn(err, `Login lockout notification failed for user ${user.id}`);
    await logSecurityEvent(pool, {
      userId: user.id,
      username: user.username,
      eventType: "login_lockout_notification_failed",
      req,
      detail: err instanceof Error ? err.message : "Gagal kirim notifikasi WA",
    });
  }
}

async function recordFailedLogin({ pool, user, req }) {
  const lockedUntilDate = getLockedUntilDate(user.locked_until);
  const expiredLock = lockedUntilDate && lockedUntilDate.getTime() <= Date.now();
  const currentFailures = expiredLock ? 0 : Number(user.failed_login_count ?? 0);
  const nextFailures = currentFailures + 1;
  const shouldLock = nextFailures >= config.login.maxFailures;
  const lockedUntil = shouldLock
    ? new Date(Date.now() + config.login.lockMinutes * 60 * 1000)
    : null;

  await pool.execute(
    `UPDATE users
        SET failed_login_count = ?,
            last_failed_login_at = CURRENT_TIMESTAMP,
            last_failed_login_ip = ?,
            locked_until = ?
      WHERE id = ?`,
    [
      nextFailures,
      String(req.ip ?? ""),
      lockedUntil,
      user.id,
    ],
  );

  await logSecurityEvent(pool, {
    userId: user.id,
    username: user.username,
    eventType: "login_failed",
    req,
    detail: `Password salah (${nextFailures}/${config.login.maxFailures})`,
  });

  if (shouldLock) {
    await logSecurityEvent(pool, {
      userId: user.id,
      username: user.username,
      eventType: "login_account_locked",
      req,
      detail: `Akun terkunci sampai ${lockedUntil.toISOString()}`,
    });
    await notifyLoginLockoutOwner({
      pool,
      user,
      req,
      lockedUntil,
      failedCount: nextFailures,
    });
    return { locked: true, lockedUntil };
  }

  return { locked: false, lockedUntil: null };
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
      `SELECT id, username, "password", is_active, created_at,
              failed_login_count, locked_until
         FROM users
        WHERE username = ?
        LIMIT 1`,
      [username],
    );

    if (rows.length === 0) {
      await logSecurityEvent(pool, {
        username,
        eventType: "login_failed_unknown_user",
        req,
        detail: "Username tidak ditemukan",
      });
      return res.status(401).json({ error: "Username atau password salah" });
    }

    const user = rows[0];

    if (!user.is_active) {
      await logSecurityEvent(pool, {
        userId: user.id,
        username: user.username,
        eventType: "login_inactive_account",
        req,
        detail: "Login ditolak karena akun nonaktif",
      });
      return res.status(403).json({ error: "Akun Anda telah dinonaktifkan" });
    }

    if (isLocked(user)) {
      await logSecurityEvent(pool, {
        userId: user.id,
        username: user.username,
        eventType: "login_locked_attempt",
        req,
        detail: `Akun masih terkunci sampai ${getLockedUntilDate(user.locked_until).toISOString()}`,
      });
      return res.status(423).json({
        error: `Akun terkunci sementara. Coba lagi setelah ${formatJakartaDate(user.locked_until)} WIB.`,
        lockedUntil: getLockedUntilDate(user.locked_until).toISOString(),
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const result = await recordFailedLogin({ pool, user, req });
      if (result.locked) {
        return res.status(423).json({
          error: `Password salah ${config.login.maxFailures}x. Akun terkunci sampai ${formatJakartaDate(result.lockedUntil)} WIB.`,
          lockedUntil: result.lockedUntil.toISOString(),
        });
      }
      return res.status(401).json({ error: "Username atau password salah" });
    }

    await pool.execute(
      `UPDATE users
          SET failed_login_count = 0,
              locked_until = NULL,
              last_failed_login_at = NULL,
              last_failed_login_ip = NULL,
              last_login_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [user.id],
    );

    setAuthCookies(res, user);

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [user.id, "login", `Login dari ${req.ip}`],
    );
    await logSecurityEvent(pool, {
      userId: user.id,
      username: user.username,
      eventType: "login_success",
      req,
      detail: "Login berhasil",
    });

    logger.info(`Admin logged in: ${user.username}`);

    res.json({
      message: "Login berhasil",
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
    clearAuthCookies(res);
    res.json({ message: "Logout berhasil" });
  } catch (err) {
    logger.error(err, "Logout error");
    clearAuthCookies(res);
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
      await logSecurityEvent(pool, {
        userId: req.user.id,
        username: req.user.username,
        eventType: "profile_secret_invalid",
        req,
        detail: "Secret key profil tidak valid",
      });
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

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Password baru minimal 8 karakter" });
    }

    if (String(secretKey ?? "").trim() !== config.resetSecret) {
      await logSecurityEvent(pool, {
        userId: req.user.id,
        username: req.user.username,
        eventType: "change_password_secret_invalid",
        req,
        detail: "Secret key ganti password tidak valid",
      });
      return res.status(403).json({ error: "Secret key tidak valid" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      `UPDATE users
          SET "password" = ?,
              failed_login_count = 0,
              locked_until = NULL,
              last_failed_login_at = NULL,
              last_failed_login_ip = NULL
        WHERE id = ?`,
      [hash, req.user.id],
    );

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [req.user.id, "change_password", "Admin mengganti password akun"],
    );
    await logSecurityEvent(pool, {
      userId: req.user.id,
      username: req.user.username,
      eventType: "change_password_success",
      req,
      detail: "Password akun diubah",
    });

    res.json({ message: "Password berhasil diubah" });
  } catch (err) {
    logger.error(err, "Change password error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function verifyResetSecret(req, res) {
  try {
    const secretKey = String(req.body?.secretKey ?? "").trim();
    const pool = getPool();

    if (!secretKey) {
      return res.status(400).json({ error: "Secret key wajib diisi" });
    }

    if (secretKey !== config.resetSecret) {
      await logSecurityEvent(pool, {
        eventType: "reset_secret_invalid",
        req,
        detail: "Verifikasi reset secret gagal",
      });
      return res.status(403).json({ error: "Secret key tidak valid" });
    }

    await logSecurityEvent(pool, {
      eventType: "reset_secret_verified",
      req,
      detail: "Reset secret berhasil diverifikasi",
    });
    res.json({ message: "Secret key valid" });
  } catch (err) {
    logger.error(err, "Verify reset secret error");
    res.status(500).json({ error: "Server error" });
  }
}

export async function resetPassword(req, res) {
  try {
    const { newPassword, confirmPassword, secretKey } = req.body;
    const pool = getPool();

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Password baru minimal 8 karakter" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Konfirmasi password tidak cocok" });
    }

    if (String(secretKey ?? "").trim() !== config.resetSecret) {
      await logSecurityEvent(pool, {
        eventType: "reset_password_secret_invalid",
        req,
        detail: "Secret key reset password tidak valid",
      });
      return res.status(403).json({ error: "Secret key tidak valid" });
    }

    const [rows] = await pool.execute("SELECT id, username FROM users ORDER BY id ASC LIMIT 1");

    if (rows.length === 0) {
      return res.status(404).json({ error: "Admin tidak ditemukan" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      `UPDATE users
          SET "password" = ?,
              failed_login_count = 0,
              locked_until = NULL,
              last_failed_login_at = NULL,
              last_failed_login_ip = NULL
        WHERE id = ?`,
      [hash, rows[0].id],
    );

    await pool.execute(
      "INSERT INTO activity_logs (user_id, action, detail) VALUES (?, ?, ?)",
      [rows[0].id, "reset_password", "Reset password via secret key"],
    );
    await logSecurityEvent(pool, {
      userId: rows[0].id,
      username: rows[0].username,
      eventType: "reset_password_success",
      req,
      detail: "Password berhasil direset via secret key",
    });
    clearAuthCookies(res);

    res.json({ message: "Password berhasil direset" });
  } catch (err) {
    logger.error(err, "Reset password error");
    res.status(500).json({ error: "Server error" });
  }
}
