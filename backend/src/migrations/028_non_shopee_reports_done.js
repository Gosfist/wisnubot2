import { getPool } from "../config/database.js";
import { columnExists, tableExists } from "./helpers/schema.js";

export async function up() {
  const pool = getPool();
  if (!(await tableExists(pool, "cs_transactions"))) return;
  if (!(await columnExists(pool, "cs_transactions", "report_status"))) return;

  await pool.execute(
    `UPDATE cs_transactions
        SET report_status = 'selesai'
      WHERE LOWER(COALESCE(platform, 'whatsapp')) <> 'shopee'
        AND COALESCE(report_status, 'proses') <> 'selesai'`,
  );
}

