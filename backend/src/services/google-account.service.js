import { getPool } from "../config/database.js";

function normalizeEmail(value) {
  return String(value ?? "").trim();
}

function mapAccount(row) {
  return {
    id: Number(row.id),
    email: String(row.email ?? ""),
    totalSlots: Number(row.total_slots ?? 5),
    usedSlots: Number(row.used_slots ?? 0),
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}

async function listForUser(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT ga.id, ga.email, ga.total_slots, ga.created_at,
            COALESCE(COUNT(tx.id), 0) AS used_slots
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
              WHEN tx.active_expires_at IS NOT NULL AND tx.active_expires_at < CURRENT_TIMESTAMP THEN 'expired'
              ELSE 'aktif'
            END
          ) = 'expired'
        )
      WHERE ga.user_id = ?
      GROUP BY ga.id, ga.email, ga.total_slots, ga.created_at
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
  const [result] = await pool.execute(
    `INSERT INTO google_accounts (user_id, email, total_slots)
     VALUES (?, ?, 5)`,
    [Number(user.id), email],
  );

  const [rows] = await pool.execute(
    `SELECT id, email, total_slots, created_at, 0 AS used_slots
       FROM google_accounts
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
    [Number(result.insertId ?? 0), Number(user.id)],
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
  deleteForUser,
};
