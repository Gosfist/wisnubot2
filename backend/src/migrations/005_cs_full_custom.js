/**
 * 005 — Foundation tables for full-custom Customer Service.
 *
 * Adds:
 *  - Columns on `customer_service`:
 *      * delivery_mode ('none' | 'stock' | 'relay')
 *      * price          (INT, IDR; nullable)
 *      * relay_prompt   (TEXT, nullable; sent after payment when delivery_mode='relay')
 *  - New table `cs_buttons`        : buttons attached to each CS message
 *  - New table `cs_stocks`         : stock pool per CS (1 row = 1 deliverable item)
 *  - New table `cs_transactions`   : Pakasir payment records
 *  - New table `cs_relay_sessions` : ongoing relay flows (customer <-> owner)
 *  - New table `app_settings`      : per-user Pakasir credentials
 *
 * Idempotent: every change checks information_schema first.
 */

async function tableExists(pool, tableName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName],
  );
  return Number(rows[0].cnt) > 0;
}

async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  return Number(rows[0].cnt) > 0;
}

async function addColumnIfMissing(pool, table, column, definition) {
  if (!(await columnExists(pool, table, column))) {
    await pool.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${definition}`);
  }
}

async function indexExists(pool, tableName, indexName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [tableName, indexName],
  );
  return Number(rows[0].cnt) > 0;
}

export async function up(pool) {
  // 1. Extend customer_service ----------------------------------------------
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
  }

  // 2. cs_buttons ------------------------------------------------------------
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

  // 3. cs_stocks -------------------------------------------------------------
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

  // 4. cs_transactions -------------------------------------------------------
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cs_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      cs_id INT NULL,
      customer_jid VARCHAR(100) NOT NULL,
      pakasir_order_id VARCHAR(120) NOT NULL,
      pakasir_payment_url VARCHAR(500) NULL,
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

  // 5. cs_relay_sessions -----------------------------------------------------
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

  // 6. app_settings ----------------------------------------------------------
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
