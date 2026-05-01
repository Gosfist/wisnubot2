import { getPool } from "../config/database.js";

async function assertCsOwnership(csId, userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id FROM customer_service WHERE id = ? AND user_id = ? LIMIT 1`,
    [Number(csId), Number(userId)],
  );
  if (rows.length === 0) {
    throw new Error("Customer service tidak ditemukan");
  }
}

function parseStockLines(input) {
  return String(input ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function listForCs(user, csId) {
  await assertCsOwnership(csId, user.id);
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, cs_id, content, is_used, used_by_jid, used_at, created_at
       FROM cs_stocks
      WHERE cs_id = ?
      ORDER BY is_used ASC, id ASC`,
    [Number(csId)],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    csId: Number(row.cs_id),
    content: String(row.content ?? ""),
    isUsed: Boolean(row.is_used),
    usedByJid: row.used_by_jid ? String(row.used_by_jid) : null,
    usedAt: row.used_at,
    createdAt: row.created_at,
  }));
}

async function summaryForUser(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT cs.id AS cs_id,
            cs.nama_perintah,
            cs.delivery_mode,
            cs.price,
            COUNT(s.id) AS total,
            SUM(CASE WHEN s.is_used = 0 THEN 1 ELSE 0 END) AS available,
            SUM(CASE WHEN s.is_used = 1 THEN 1 ELSE 0 END) AS used
       FROM customer_service cs
       LEFT JOIN cs_stocks s ON s.cs_id = cs.id
      WHERE cs.user_id = ?
      GROUP BY cs.id
      ORDER BY cs.id ASC`,
    [user.id],
  );
  return rows.map((row) => ({
    csId: Number(row.cs_id),
    namaPerintah: String(row.nama_perintah ?? ""),
    deliveryMode: String(row.delivery_mode ?? "none"),
    price: row.price === null ? null : Number(row.price),
    total: Number(row.total ?? 0),
    available: Number(row.available ?? 0),
    used: Number(row.used ?? 0),
  }));
}

async function addStocks(user, csId, contents) {
  await assertCsOwnership(csId, user.id);
  const lines = Array.isArray(contents)
    ? contents.map((c) => String(c ?? "").trim()).filter(Boolean)
    : parseStockLines(contents);

  if (lines.length === 0) {
    throw new Error("Tidak ada stock yang valid untuk ditambahkan");
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const content of lines) {
      await conn.execute(
        `INSERT INTO cs_stocks (cs_id, content) VALUES (?, ?)`,
        [Number(csId), content],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { added: lines.length };
}

async function deleteStock(user, stockId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT s.id
       FROM cs_stocks s
       JOIN customer_service cs ON cs.id = s.cs_id
      WHERE s.id = ? AND cs.user_id = ?
      LIMIT 1`,
    [Number(stockId), user.id],
  );
  if (rows.length === 0) {
    return false;
  }

  const [result] = await pool.execute(
    `DELETE FROM cs_stocks WHERE id = ?`,
    [Number(stockId)],
  );
  return Number(result.affectedRows || 0) > 0;
}

async function deleteAllForCs(user, csId) {
  await assertCsOwnership(csId, user.id);
  const pool = getPool();
  const [result] = await pool.execute(
    `DELETE FROM cs_stocks WHERE cs_id = ? AND is_used = 0`,
    [Number(csId)],
  );
  return Number(result.affectedRows || 0);
}

/**
 * Atomically reserve the next available stock for a customer.
 * Returns { id, content } or null if pool empty.
 */
async function reserveOne(csId, customerJid) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT id, content
         FROM cs_stocks
        WHERE cs_id = ? AND is_used = 0
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE`,
      [Number(csId)],
    );
    if (rows.length === 0) {
      await conn.rollback();
      return null;
    }
    const stock = rows[0];
    await conn.execute(
      `UPDATE cs_stocks
          SET is_used = 1, used_by_jid = ?, used_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [String(customerJid), Number(stock.id)],
    );
    await conn.commit();
    return { id: Number(stock.id), content: String(stock.content) };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export const csStockService = {
  listForCs,
  summaryForUser,
  addStocks,
  deleteStock,
  deleteAllForCs,
  reserveOne,
};
