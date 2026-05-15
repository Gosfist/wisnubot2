import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(pool, "users", "failed_login_count", "INT NOT NULL DEFAULT 0");
  await addColumnIfMissing(pool, "users", "locked_until", "TIMESTAMPTZ NULL");
  await addColumnIfMissing(pool, "users", "last_failed_login_at", "TIMESTAMPTZ NULL");
  await addColumnIfMissing(pool, "users", "last_failed_login_ip", "VARCHAR(100) NULL");
  await addColumnIfMissing(pool, "users", "last_login_at", "TIMESTAMPTZ NULL");

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS security_events (
      id SERIAL PRIMARY KEY,
      user_id INT NULL,
      username VARCHAR(100) NULL,
      event_type VARCHAR(100) NOT NULL,
      ip_address VARCHAR(100) NULL,
      user_agent TEXT NULL,
      detail TEXT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_security_events_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON security_events (user_id, created_at DESC)`);
  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_security_events_type_created ON security_events (event_type, created_at DESC)`);
  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users (locked_until)`);
}
