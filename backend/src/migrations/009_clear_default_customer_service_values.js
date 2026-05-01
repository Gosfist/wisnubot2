import { tableExists } from "./helpers/schema.js";

export async function up(pool) {
  if (!(await tableExists(pool, "customer_service"))) {
    return;
  }

  await pool.execute(
    `UPDATE customer_service
        SET value = ''
      WHERE nama_perintah IN ('welcome', 'start')`,
  );
}
