import { getPool } from "../config/database.js";

function normalizeName(value) {
  return String(value ?? "").trim();
}

function mapCategory(row) {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}

async function listForUser(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, name, created_at
       FROM google_account_categories
      WHERE user_id = ?
      ORDER BY name ASC`,
    [Number(user.id)],
  );
  return rows.map(mapCategory);
}

async function createForUser(user, payload) {
  const name = normalizeName(payload.name);
  if (!name) {
    throw new Error("Nama kategori wajib diisi");
  }

  const pool = getPool();
  try {
    const [result] = await pool.execute(
      `INSERT INTO google_account_categories (user_id, name)
       VALUES (?, ?)`,
      [Number(user.id), name],
    );
    const [rows] = await pool.execute(
      "SELECT id, name, created_at FROM google_account_categories WHERE id = ? AND user_id = ? LIMIT 1",
      [Number(result.insertId ?? 0), Number(user.id)],
    );
    return mapCategory(rows[0]);
  } catch (err) {
    if (err?.code === "23505" || String(err?.message ?? "").includes("ux_google_account_categories_user_name")) {
      throw new Error("Kategori sudah ada");
    }
    throw err;
  }
}

async function updateForUser(user, categoryId, payload) {
  const id = Number(categoryId);
  const name = normalizeName(payload.name);
  if (!id) {
    throw new Error("Kategori tidak valid");
  }
  if (!name) {
    throw new Error("Nama kategori wajib diisi");
  }

  const pool = getPool();
  const [existingRows] = await pool.execute(
    "SELECT name FROM google_account_categories WHERE id = ? AND user_id = ? LIMIT 1",
    [id, Number(user.id)],
  );
  const oldName = existingRows[0]?.name ? String(existingRows[0].name) : "";
  if (!oldName) {
    throw new Error("Kategori tidak ditemukan");
  }

  try {
    const [result] = await pool.execute(
      `UPDATE google_account_categories
          SET name = ?
        WHERE id = ?
          AND user_id = ?`,
      [name, id, Number(user.id)],
    );
    if (Number(result.affectedRows ?? 0) === 0) {
      throw new Error("Kategori tidak ditemukan");
    }
  } catch (err) {
    if (err?.code === "23505" || String(err?.message ?? "").includes("ux_google_account_categories_user_name")) {
      throw new Error("Kategori sudah ada");
    }
    throw err;
  }

  await pool.execute(
    `UPDATE google_accounts
        SET category = ?
      WHERE user_id = ?
        AND lower(COALESCE(category, '')) = lower(?)`,
    [name, Number(user.id), oldName],
  );

  const [rows] = await pool.execute(
    "SELECT id, name, created_at FROM google_account_categories WHERE id = ? AND user_id = ? LIMIT 1",
    [id, Number(user.id)],
  );
  return mapCategory(rows[0]);
}

async function deleteForUser(user, categoryId) {
  const id = Number(categoryId);
  if (!id) {
    throw new Error("Kategori tidak valid");
  }

  const pool = getPool();
  const [existingRows] = await pool.execute(
    "SELECT name FROM google_account_categories WHERE id = ? AND user_id = ? LIMIT 1",
    [id, Number(user.id)],
  );
  const name = existingRows[0]?.name ? String(existingRows[0].name) : "";
  if (!name) {
    return false;
  }

  await pool.execute(
    `UPDATE google_accounts
        SET category = NULL
      WHERE user_id = ?
        AND lower(COALESCE(category, '')) = lower(?)`,
    [Number(user.id), name],
  );

  const [result] = await pool.execute(
    "DELETE FROM google_account_categories WHERE id = ? AND user_id = ?",
    [id, Number(user.id)],
  );
  return Number(result.affectedRows ?? 0) > 0;
}

export const googleAccountCategoryService = {
  listForUser,
  createForUser,
  updateForUser,
  deleteForUser,
};
