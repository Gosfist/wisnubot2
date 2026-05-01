/**
 * 005 - Foundation tables for full-custom Customer Service.
 */

import {
  addColumnIfMissing,
  columnExists,
  indexExists,
  tableExists,
} from "./helpers/schema.js";

export async function up(pool) {
  if (await tableExists(pool, "customer_service")) {
    await addColumnIfMissing(
      pool,
      "customer_service",
      "delivery_mode",
      "VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (delivery_mode IN ('none','stock','relay'))",
    );
    await addColumnIfMissing(pool, "customer_service", "price", "INT NULL");
    await addColumnIfMissing(pool, "customer_service", "relay_prompt", "TEXT NULL");
    await addColumnIfMissing(pool, "customer_service", "relay_waiting_text", "TEXT NULL");
    await addColumnIfMissing(
      pool,
      "customer_service",
      "relay_owner_instruction",
      "TEXT NULL",
    );
    await addColumnIfMissing(pool, "customer_service", "relay_done_text", "TEXT NULL");
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cs_buttons (
      id SERIAL PRIMARY KEY,
      cs_id INT NOT NULL,
      label VARCHAR(60) NOT NULL,
      button_type VARCHAR(20) NOT NULL CHECK (button_type IN ('link','buy','url','reply')),
      target_command VARCHAR(100) NULL,
      target_url VARCHAR(500) NULL,
      reply_text TEXT NULL,
      order_index INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_cs_buttons_cs FOREIGN KEY (cs_id)
        REFERENCES customer_service(id) ON DELETE CASCADE
    )
  `);
  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_cs_buttons_cs ON cs_buttons (cs_id, order_index)`,
  );

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cs_stocks (
      id SERIAL PRIMARY KEY,
      cs_id INT NOT NULL,
      content TEXT NOT NULL,
      is_used SMALLINT NOT NULL DEFAULT 0,
      used_by_jid VARCHAR(100) NULL,
      used_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_cs_stocks_cs FOREIGN KEY (cs_id)
        REFERENCES customer_service(id) ON DELETE CASCADE
    )
  `);
  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_cs_stocks_avail ON cs_stocks (cs_id, is_used)`,
  );

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cs_transactions (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      cs_id INT NULL,
      customer_jid VARCHAR(100) NOT NULL,
      pakasir_order_id VARCHAR(120) NOT NULL,
      pakasir_payment_url VARCHAR(500) NULL,
      qris_string TEXT NULL,
      amount INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','paid','failed','expired')),
      stock_id INT NULL,
      delivered_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      paid_at TIMESTAMPTZ NULL,
      CONSTRAINT ux_cs_tx_order UNIQUE (pakasir_order_id),
      CONSTRAINT fk_cs_tx_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_cs_tx_cs FOREIGN KEY (cs_id)
        REFERENCES customer_service(id) ON DELETE SET NULL,
      CONSTRAINT fk_cs_tx_stock FOREIGN KEY (stock_id)
        REFERENCES cs_stocks(id) ON DELETE SET NULL
    )
  `);
  await addColumnIfMissing(pool, "cs_transactions", "qris_string", "TEXT NULL");
  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_cs_tx_user ON cs_transactions (user_id)`);
  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_cs_tx_jid ON cs_transactions (customer_jid)`);
  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_cs_tx_status ON cs_transactions (status)`);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cs_relay_sessions (
      id SERIAL PRIMARY KEY,
      transaction_id INT NOT NULL,
      customer_jid VARCHAR(100) NOT NULL,
      state VARCHAR(40) NOT NULL DEFAULT 'waiting_customer_input'
        CHECK (state IN ('waiting_customer_input','waiting_owner_done','done','cancelled')),
      customer_input TEXT NULL,
      owner_msg_id VARCHAR(120) NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ux_cs_relay_tx UNIQUE (transaction_id),
      CONSTRAINT fk_cs_relay_tx FOREIGN KEY (transaction_id)
        REFERENCES cs_transactions(id) ON DELETE CASCADE
    )
  `);

  if (!(await indexExists(pool, "cs_relay_sessions", "ux_cs_relay_tx"))) {
    await pool.execute(
      `ALTER TABLE cs_relay_sessions ADD CONSTRAINT ux_cs_relay_tx UNIQUE (transaction_id)`,
    );
  }
  await pool.execute(`CREATE INDEX IF NOT EXISTS idx_cs_relay_state ON cs_relay_sessions (state)`);
  await pool.execute(
    `CREATE INDEX IF NOT EXISTS idx_cs_relay_owner_msg ON cs_relay_sessions (owner_msg_id)`,
  );

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      user_id INT PRIMARY KEY,
      pakasir_slug VARCHAR(100) NULL,
      pakasir_api_key VARCHAR(255) NULL,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_app_settings_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  if (await columnExists(pool, "app_settings", "owner_relay_jid")) {
    await pool.execute(`ALTER TABLE app_settings DROP COLUMN owner_relay_jid`);
  }
}
