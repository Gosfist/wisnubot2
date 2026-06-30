import { getPool } from "../config/database.js";

function mapPlan(row) {
  return {
    id: Number(row.id),
    label: String(row.label ?? ""),
    durationDays: Number(row.duration_days ?? 0),
    price: Number(row.price ?? 0),
    isActive: Boolean(Number(row.is_active ?? 0)),
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function normalizeMutablePayload(payload = {}) {
  const label = String(payload.label ?? payload.nama ?? "").trim();
  const durationDays = Math.floor(
    Number(payload.durationDays ?? payload.duration_days ?? payload.masaAktif ?? 0),
  );
  const price = Math.floor(Number(payload.price ?? 0));
  const isActive = Boolean(payload.isActive ?? payload.is_active ?? true);

  if (!label) {
    throw new Error("Nama harga wajib diisi");
  }
  if (!Number.isFinite(durationDays) || durationDays <= 0) {
    throw new Error("Masa aktif wajib diisi dalam hari");
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Harga wajib lebih dari 0");
  }

  return { label, durationDays, price, isActive };
}

async function listForUser(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, label, duration_days, price, is_active, created_at, updated_at
      FROM gemini_price_plans
      WHERE user_id = ?
      ORDER BY is_active DESC,
               lower(label) ASC,
               duration_days ASC,
               id ASC`,
    [Number(user.id)],
  );
  return rows.map(mapPlan);
}

async function createForUser(user, payload) {
  const normalized = normalizeMutablePayload(payload);
  const pool = getPool();

  const [exists] = await pool.execute(
    "SELECT id FROM gemini_price_plans WHERE user_id = ? AND lower(label) = lower(?) LIMIT 1",
    [Number(user.id), normalized.label],
  );
  if (exists.length > 0) {
    throw new Error("Nama harga sudah digunakan");
  }

  const [result] = await pool.execute(
    `INSERT INTO gemini_price_plans (user_id, label, duration_days, price, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [
      Number(user.id),
      normalized.label,
      normalized.durationDays,
      normalized.price,
      normalized.isActive ? 1 : 0,
    ],
  );
  const [rows] = await pool.execute(
    `SELECT id, label, duration_days, price, is_active, created_at, updated_at
       FROM gemini_price_plans
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
    [Number(result.insertId), Number(user.id)],
  );
  return mapPlan(rows[0]);
}

async function updateForUser(user, planId, payload) {
  const id = Number(planId);
  const normalized = normalizeMutablePayload(payload);
  if (!id) throw new Error("Paket harga tidak valid");

  const pool = getPool();
  const [exists] = await pool.execute(
    `SELECT id
       FROM gemini_price_plans
      WHERE user_id = ?
        AND lower(label) = lower(?)
        AND id <> ?
      LIMIT 1`,
    [Number(user.id), normalized.label, id],
  );
  if (exists.length > 0) {
    throw new Error("Nama harga sudah digunakan");
  }

  const [result] = await pool.execute(
    `UPDATE gemini_price_plans
        SET label = ?,
            duration_days = ?,
            price = ?,
            is_active = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`,
    [
      normalized.label,
      normalized.durationDays,
      normalized.price,
      normalized.isActive ? 1 : 0,
      id,
      Number(user.id),
    ],
  );
  if (Number(result.affectedRows ?? 0) === 0) {
    throw new Error("Paket harga tidak ditemukan");
  }

  const [rows] = await pool.execute(
    `SELECT id, label, duration_days, price, is_active, created_at, updated_at
       FROM gemini_price_plans
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
    [id, Number(user.id)],
  );
  return mapPlan(rows[0]);
}

async function deleteForUser(user, planId) {
  const id = Number(planId);
  if (!id) throw new Error("Paket harga tidak valid");

  const pool = getPool();
  const [result] = await pool.execute(
    "DELETE FROM gemini_price_plans WHERE id = ? AND user_id = ?",
    [id, Number(user.id)],
  );
  return Number(result.affectedRows ?? 0) > 0;
}

async function getActiveForUser(userId, planId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, label, duration_days, price, is_active, created_at, updated_at
       FROM gemini_price_plans
      WHERE id = ?
        AND user_id = ?
        AND is_active = 1
      LIMIT 1`,
    [Number(planId), Number(userId)],
  );
  return rows[0] ? mapPlan(rows[0]) : null;
}

export const geminiPriceService = {
  listForUser,
  createForUser,
  updateForUser,
  deleteForUser,
  getActiveForUser,
};
