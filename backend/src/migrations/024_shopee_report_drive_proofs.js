async function addColumnIfMissing(pool, table, column, definition) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ?
        AND column_name = ?`,
    [table, column],
  );
  if (Number(rows[0]?.cnt ?? 0) > 0) return;
  await pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function up(pool) {
  await addColumnIfMissing(pool, "app_settings", "google_drive_credentials_json", "TEXT NULL");
  await addColumnIfMissing(pool, "app_settings", "google_drive_folder_id", "VARCHAR(255) NULL");

  await addColumnIfMissing(pool, "cs_transactions", "report_status", "VARCHAR(16) NOT NULL DEFAULT 'proses'");
  await addColumnIfMissing(pool, "cs_transactions", "proof_drive_file_id", "VARCHAR(255) NULL");
  await addColumnIfMissing(pool, "cs_transactions", "proof_drive_url", "TEXT NULL");
  await addColumnIfMissing(pool, "cs_transactions", "proof_uploaded_at", "TIMESTAMPTZ NULL");

  await pool.execute(
    `UPDATE cs_transactions
        SET report_status = 'proses'
      WHERE report_status IS NULL
         OR report_status NOT IN ('proses', 'selesai')`,
  );

  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_cs_tx_report_status
       ON cs_transactions (user_id, platform, report_status)`,
  );
}
