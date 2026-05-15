import { getPool } from "../config/database.js";

const FIXED_PRICE_PLANS = [
  { label: "SHP 1 Bulan", durationDays: 30, price: 10000 },
  { label: "SHP 2 Bulan", durationDays: 60, price: 20000 },
  { label: "SHP 3 Bulan", durationDays: 90, price: 30000 },
  { label: "WA 1 Bulan", durationDays: 30, price: 15000 },
  { label: "WA 2 Bulan", durationDays: 60, price: 25000 },
  { label: "WA 3 Bulan", durationDays: 90, price: 35000 },
];

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
  const price = Math.floor(Number(payload.price ?? 0));
  const isActive = Boolean(payload.isActive ?? payload.is_active ?? true);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Harga wajib lebih dari 0");
  }

  return { price, isActive };
}

async function ensureFixedPlansForUser(userId) {
  const pool = getPool();
  for (const plan of FIXED_PRICE_PLANS) {
    const [rows] = await pool.execute(
      "SELECT id FROM gemini_price_plans WHERE user_id = ? AND label = ? LIMIT 1",
      [Number(userId), plan.label],
    );
    if (rows.length > 0) continue;

    await pool.execute(
      `INSERT INTO gemini_price_plans (user_id, label, duration_days, price, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [Number(userId), plan.label, plan.durationDays, plan.price],
    );
  }
}

async function listForUser(user) {
  await ensureFixedPlansForUser(user.id);
  const pool = getPool();
  const fixedLabels = FIXED_PRICE_PLANS.map((plan) => plan.label);
  const [rows] = await pool.execute(
    `SELECT id, label, duration_days, price, is_active, created_at, updated_at
       FROM gemini_price_plans
      WHERE user_id = ?
        AND label IN (${fixedLabels.map(() => "?").join(", ")})
      ORDER BY CASE WHEN label LIKE 'SHP %' THEN 0 ELSE 1 END,
               duration_days ASC,
               id ASC`,
    [Number(user.id), ...fixedLabels],
  );
  return rows.map(mapPlan);
}

async function createForUser(user, payload) {
  await ensureFixedPlansForUser(user.id);
  throw new Error("Paket harga sudah fix. Edit harga dan status saja.");
}

async function updateForUser(user, planId, payload) {
  const id = Number(planId);
  const normalized = normalizeMutablePayload(payload);
  if (!id) throw new Error("Paket harga tidak valid");

  const pool = getPool();
  const [result] = await pool.execute(
    `UPDATE gemini_price_plans
        SET price = ?,
            is_active = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
        AND label IN (${FIXED_PRICE_PLANS.map(() => "?").join(", ")})`,
    [
      normalized.price,
      normalized.isActive ? 1 : 0,
      id,
      Number(user.id),
      ...FIXED_PRICE_PLANS.map((plan) => plan.label),
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
  throw new Error("Paket harga fix tidak bisa dihapus. Ubah status menjadi non aktif.");
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
