/**
 * 005 - Foundation tables for full-custom Customer Service.
 *
 * Adds product delivery settings, per-entry buttons, stock pools, Pakasir
 * transactions, relay sessions, and per-user Pakasir credentials.
 *
 * Idempotent: every change checks information_schema first.
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
      "ENUM('none','stock','relay') NOT NULL DEFAULT 'none' AFTER value",
    );
    await addColumnIfMissing(
      pool,
      "customer_service",
      "price",
      "INT NULL AFTER delivery_mode",
    );
    await addColumnIfMissing(
      pool,
      "customer_service",
      "relay_prompt",
      "TEXT NULL AFTER price",
    );
    await addColumnIfMissing(
      pool,
      "customer_service",
      "relay_waiting_text",
      "TEXT NULL AFTER relay_prompt",
    );
    await addColumnIfMissing(
      pool,
      "customer_service",
      "relay_owner_instruction",
      "TEXT NULL AFTER relay_waiting_text",
    );
    await addColumnIfMissing(
      pool,
      "customer_service",
      "relay_done_text",
      "TEXT NULL AFTER relay_owner_instruction",
    );
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cs_buttons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cs_id INT NOT NULL,
      label VARCHAR(60) NOT NULL,
      button_type ENUM('link','buy','url','reply') NOT NULL,
      target_command VARCHAR(100) NULL,
      target_url VARCHAR(500) NULL,
      reply_text TEXT NULL,
      order_index INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cs_buttons_cs (cs_id, order_index),
      CONSTRAINT fk_cs_buttons_cs FOREIGN KEY (cs_id)
        REFERENCES customer_service(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cs_stocks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cs_id INT NOT NULL,
      content TEXT NOT NULL,
      is_used TINYINT(1) NOT NULL DEFAULT 0,
      used_by_jid VARCHAR(100) NULL,
      used_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cs_stocks_avail (cs_id, is_used),
      CONSTRAINT fk_cs_stocks_cs FOREIGN KEY (cs_id)
        REFERENCES customer_service(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cs_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      cs_id INT NULL,
      customer_jid VARCHAR(100) NOT NULL,
      pakasir_order_id VARCHAR(120) NOT NULL,
      pakasir_payment_url VARCHAR(500) NULL,
      qris_string TEXT NULL,
      amount INT NOT NULL,
      status ENUM('pending','paid','failed','expired') NOT NULL DEFAULT 'pending',
      stock_id INT NULL,
      delivered_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      paid_at TIMESTAMP NULL,
      UNIQUE KEY ux_cs_tx_order (pakasir_order_id),
      INDEX idx_cs_tx_user (user_id),
      INDEX idx_cs_tx_jid (customer_jid),
      INDEX idx_cs_tx_status (status),
      CONSTRAINT fk_cs_tx_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_cs_tx_cs FOREIGN KEY (cs_id)
        REFERENCES customer_service(id) ON DELETE SET NULL,
      CONSTRAINT fk_cs_tx_stock FOREIGN KEY (stock_id)
        REFERENCES cs_stocks(id) ON DELETE SET NULL
    )
  `);

  await addColumnIfMissing(
    pool,
    "cs_transactions",
    "qris_string",
    "TEXT NULL AFTER pakasir_payment_url",
  );

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cs_relay_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      customer_jid VARCHAR(100) NOT NULL,
      state ENUM('waiting_customer_input','waiting_owner_done','done','cancelled')
        NOT NULL DEFAULT 'waiting_customer_input',
      customer_input TEXT NULL,
      owner_msg_id VARCHAR(120) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY ux_cs_relay_tx (transaction_id),
      INDEX idx_cs_relay_state (state),
      INDEX idx_cs_relay_owner_msg (owner_msg_id),
      CONSTRAINT fk_cs_relay_tx FOREIGN KEY (transaction_id)
        REFERENCES cs_transactions(id) ON DELETE CASCADE
    )
  `);

  if (!(await indexExists(pool, "cs_relay_sessions", "ux_cs_relay_tx"))) {
    await pool.execute(
      `ALTER TABLE cs_relay_sessions ADD UNIQUE KEY ux_cs_relay_tx (transaction_id)`,
    );
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      user_id INT PRIMARY KEY,
      pakasir_slug VARCHAR(100) NULL,
      pakasir_api_key VARCHAR(255) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_app_settings_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  if (await columnExists(pool, "app_settings", "owner_relay_jid")) {
    await pool.execute(`ALTER TABLE app_settings DROP COLUMN owner_relay_jid`);
  }
}
