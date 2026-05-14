export async function up(pool) {
  await pool.execute(
    `UPDATE cs_transactions
        SET report_status = 'selesai'
      WHERE platform = 'shopee'
        AND status = 'paid'
        AND COALESCE(report_status, 'proses') = 'proses'`,
  );
}
