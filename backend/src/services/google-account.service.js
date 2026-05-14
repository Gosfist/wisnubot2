import { getPool } from "../config/database.js";

function normalizeEmail(value) {
  return String(value ?? "").trim();
}

function isFullPrivateAccount(email) {
  return /\|\s*full\s+private\b/i.test(String(email ?? ""));
}

function getEffectiveTotalSlots(row) {
  return isFullPrivateAccount(row.email) ? 1 : Number(row.total_slots ?? 5);
}

function mapAccount(row) {
  const totalSlots = getEffectiveTotalSlots(row);
  return {
    id: Number(row.id),
    email: String(row.email ?? ""),
    totalSlots,
    usedSlots: Number(row.used_slots ?? 0),
    isSuspended: Boolean(row.is_suspended),
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}

async function findForUserByEmail(pool, userId, email) {
  const [rows] = await pool.execute(
    `SELECT ga.id, ga.email, ga.total_slots, ga.is_suspended, ga.created_at,
            COALESCE(SUM(CASE WHEN tx.id IS NULL THEN 0 ELSE GREATEST(COALESCE(tx.buyer_count, 1), 1) END), 0) AS used_slots
       FROM google_accounts ga
       LEFT JOIN cs_transactions tx
         ON tx.google_account_id = ga.id
        AND tx.user_id = ga.user_id
        AND tx.status = 'paid'
        AND NOT (
          tx.member_status = 'kick'
          AND COALESCE(
            tx.active_status,
            CASE
              WHEN COALESCE(tx.platform, '') <> 'pribadi'
               AND tx.active_expires_at IS NOT NULL
               AND tx.active_expires_at < CURRENT_TIMESTAMP THEN 'expired'
              ELSE 'aktif'
            END
          ) = 'expired'
        )
      WHERE ga.user_id = ?
        AND lower(ga.email) = lower(?)
      GROUP BY ga.id, ga.email, ga.total_slots, ga.is_suspended, ga.created_at
      LIMIT 1`,
    [Number(userId), email],
  );

  return rows[0] ? mapAccount(rows[0]) : null;
}

async function listForUser(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT ga.id, ga.email, ga.total_slots, ga.is_suspended, ga.created_at,
            COALESCE(SUM(CASE WHEN tx.id IS NULL THEN 0 ELSE GREATEST(COALESCE(tx.buyer_count, 1), 1) END), 0) AS used_slots
       FROM google_accounts ga
       LEFT JOIN cs_transactions tx
         ON tx.google_account_id = ga.id
        AND tx.user_id = ga.user_id
        AND tx.status = 'paid'
        AND NOT (
          tx.member_status = 'kick'
          AND COALESCE(
            tx.active_status,
            CASE
              WHEN COALESCE(tx.platform, '') <> 'pribadi'
               AND tx.active_expires_at IS NOT NULL
               AND tx.active_expires_at < CURRENT_TIMESTAMP THEN 'expired'
              ELSE 'aktif'
            END
          ) = 'expired'
        )
      WHERE ga.user_id = ?
      GROUP BY ga.id, ga.email, ga.total_slots, ga.is_suspended, ga.created_at
      ORDER BY ga.created_at DESC, ga.id DESC`,
    [Number(user.id)],
  );
  return rows.map(mapAccount);
}

async function createForUser(user, payload) {
  const email = normalizeEmail(payload.email);
  if (!email) {
    throw new Error("Email akun Google wajib diisi");
  }

  const pool = getPool();
  const totalSlots = isFullPrivateAccount(email) ? 1 : 5;
  const userId = Number(user.id);
  const existingAccount = await findForUserByEmail(pool, userId, email);
  if (existingAccount) {
    return existingAccount;
  }

  let insertId = 0;
  try {
    const [result] = await pool.execute(
      `INSERT INTO google_accounts (user_id, email, total_slots)
       VALUES (?, ?, ?)`,
      [userId, email, totalSlots],
    );
    insertId = Number(result.insertId ?? 0);
  } catch (err) {
    if (err?.code !== "23505" && !String(err?.message ?? "").includes("ux_google_accounts_user_email")) {
      throw err;
    }

    const account = await findForUserByEmail(pool, userId, email);
    if (account) {
      return account;
    }
    throw err;
  }

  const [rows] = await pool.execute(
    `SELECT id, email, total_slots, is_suspended, created_at, 0 AS used_slots
       FROM google_accounts
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
    [insertId, userId],
  );

  return mapAccount(rows[0]);
}

async function setSuspendedForUser(user, accountId, suspended) {
  const id = Number(accountId);
  if (!id) {
    throw new Error("Google Account tidak valid");
  }

  const nextSuspended = Boolean(suspended);
  const pool = getPool();
  const [result] = await pool.execute(
    `UPDATE google_accounts
        SET is_suspended = ?
      WHERE id = ?
        AND user_id = ?`,
    [nextSuspended, id, Number(user.id)],
  );

  if (Number(result.affectedRows ?? 0) === 0) {
    throw new Error("Google Account tidak ditemukan");
  }

  const [rows] = await pool.execute(
    `SELECT ga.id, ga.email, ga.total_slots, ga.is_suspended, ga.created_at,
            COALESCE(SUM(CASE WHEN tx.id IS NULL THEN 0 ELSE GREATEST(COALESCE(tx.buyer_count, 1), 1) END), 0) AS used_slots
       FROM google_accounts ga
       LEFT JOIN cs_transactions tx
         ON tx.google_account_id = ga.id
        AND tx.user_id = ga.user_id
        AND tx.status = 'paid'
        AND NOT (
          tx.member_status = 'kick'
          AND COALESCE(
            tx.active_status,
            CASE
              WHEN COALESCE(tx.platform, '') <> 'pribadi'
               AND tx.active_expires_at IS NOT NULL
               AND tx.active_expires_at < CURRENT_TIMESTAMP THEN 'expired'
              ELSE 'aktif'
            END
          ) = 'expired'
        )
      WHERE ga.id = ?
        AND ga.user_id = ?
      GROUP BY ga.id, ga.email, ga.total_slots, ga.is_suspended, ga.created_at
      LIMIT 1`,
    [id, Number(user.id)],
  );

  return mapAccount(rows[0]);
}

async function deleteForUser(user, accountId) {
  const id = Number(accountId);
  if (!id) {
    throw new Error("Google Account tidak valid");
  }

  const pool = getPool();
  const [usedRows] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM cs_transactions WHERE google_account_id = ? AND user_id = ?",
    [id, Number(user.id)],
  );
  if (Number(usedRows[0]?.cnt ?? 0) > 0) {
    throw new Error("Google Account masih dipakai transaksi dan tidak bisa dihapus");
  }

  const [result] = await pool.execute(
    "DELETE FROM google_accounts WHERE id = ? AND user_id = ?",
    [id, Number(user.id)],
  );
  return Number(result.affectedRows ?? 0) > 0;
}

export const googleAccountService = {
  listForUser,
  createForUser,
  setSuspendedForUser,
  deleteForUser,
};
