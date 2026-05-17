export async function up(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS broadcast_runs (
      id SERIAL PRIMARY KEY,
      broadcast_id INT NOT NULL,
      user_id INT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'running',
      total_targets INT NOT NULL DEFAULT 0,
      processed_targets INT NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMPTZ NULL,
      CONSTRAINT fk_broadcast_runs_broadcast FOREIGN KEY (broadcast_id)
        REFERENCES broadcasts(id) ON DELETE CASCADE,
      CONSTRAINT fk_broadcast_runs_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS broadcast_run_items (
      id SERIAL PRIMARY KEY,
      run_id INT NOT NULL,
      broadcast_id INT NOT NULL,
      user_id INT NOT NULL,
      group_jid VARCHAR(100) NOT NULL,
      group_name VARCHAR(200) NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      error_text TEXT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      processed_at TIMESTAMPTZ NULL,
      CONSTRAINT fk_broadcast_run_items_run FOREIGN KEY (run_id)
        REFERENCES broadcast_runs(id) ON DELETE CASCADE,
      CONSTRAINT fk_broadcast_run_items_broadcast FOREIGN KEY (broadcast_id)
        REFERENCES broadcasts(id) ON DELETE CASCADE,
      CONSTRAINT fk_broadcast_run_items_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_broadcast_run_items_target
      ON broadcast_run_items (run_id, group_jid)
  `);

  await pool.execute(`
    CREATE INDEX IF NOT EXISTS idx_broadcast_runs_resume
      ON broadcast_runs (user_id, status, started_at)
  `);

  await pool.execute(`
    CREATE INDEX IF NOT EXISTS idx_broadcast_run_items_pending
      ON broadcast_run_items (run_id, status)
  `);

  await pool.execute(`
    UPDATE cs_transactions
       SET active_exp_notified_at = COALESCE(active_exp_notified_at, CURRENT_TIMESTAMP)
     WHERE status = 'paid'
       AND active_expires_at IS NOT NULL
       AND active_expires_at < CURRENT_DATE
       AND active_exp_notified_at IS NULL
  `);

  await pool.execute(`
    UPDATE cs_transactions
       SET warranty_exp_notified_at = COALESCE(warranty_exp_notified_at, CURRENT_TIMESTAMP)
     WHERE status = 'paid'
       AND warranty_expires_at IS NOT NULL
       AND warranty_expires_at < CURRENT_DATE
       AND warranty_exp_notified_at IS NULL
  `);
}
