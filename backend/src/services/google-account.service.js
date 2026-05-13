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

export const googleAccountService = {
  listForUser,
  createForUser,
};
