/**
 * 004 — Simplify customer service tables.
 *
 * Why: 1 user = 1 bot, so CS data should be tied to the user (not the bot).
 * Bot can be replaced (re-pairing) without losing CS configuration.
 *
 * Changes:
 *  - Rename `customer_service_owner` -> `customer_service`
 *  - Rename `customer_service_owner_contacts` -> `customer_service_contacts`
 *  - Replace `bot_id` (FK to bots) with `user_id` (FK to users) in both
 *  - Backfill `user_id` from `bots.user_id`
 *  - Update unique keys to use user_id
 *
 * Idempotent: safely re-runs by checking column / table state.
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

async function constraintName(pool, tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows[0]?.CONSTRAINT_NAME ?? null;
}

async function indexName(pool, tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND NON_UNIQUE = 0
        AND INDEX_NAME <> 'PRIMARY'
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows[0]?.INDEX_NAME ?? null;
}

async function migrateTable(pool, oldName, newName, uniqueColumns, newUniqueKeyName) {
  // Step 1: rename if old table exists and new doesn't
  if (await tableExists(pool, oldName) && !(await tableExists(pool, newName))) {
    await pool.execute(`RENAME TABLE \`${oldName}\` TO \`${newName}\``);
  }

  if (!(await tableExists(pool, newName))) {
    return; // nothing to migrate
  }

  // Step 2: add user_id column (nullable for backfill)
  if (!(await columnExists(pool, newName, "user_id"))) {
    await pool.execute(
      `ALTER TABLE \`${newName}\` ADD COLUMN user_id INT NULL AFTER id`,
    );
  }

  // Step 3: backfill user_id from bots if bot_id still present
  if (await columnExists(pool, newName, "bot_id")) {
    await pool.execute(
      `UPDATE \`${newName}\` cs
         JOIN bots b ON b.id = cs.bot_id
          SET cs.user_id = b.user_id
        WHERE cs.user_id IS NULL`,
    );

    // Step 4: drop FK on bot_id (find dynamic constraint name)
    const fkName = await constraintName(pool, newName, "bot_id");
    if (fkName) {
      await pool.execute(`ALTER TABLE \`${newName}\` DROP FOREIGN KEY \`${fkName}\``);
    }

    // Step 5: drop unique index that includes bot_id (find dynamic name)
    const idxName = await indexName(pool, newName, "bot_id");
    if (idxName) {
      await pool.execute(`ALTER TABLE \`${newName}\` DROP INDEX \`${idxName}\``);
    }

    // Step 6: drop bot_id column
    await pool.execute(`ALTER TABLE \`${newName}\` DROP COLUMN bot_id`);
  }

  // Step 7: clean orphans (rows with NULL user_id) so we can set NOT NULL
  await pool.execute(`DELETE FROM \`${newName}\` WHERE user_id IS NULL`);

  // Step 8: enforce NOT NULL
  await pool.execute(
    `ALTER TABLE \`${newName}\` MODIFY COLUMN user_id INT NOT NULL`,
  );

  // Step 9: add FK to users(id) if missing
  const userFk = await constraintName(pool, newName, "user_id");
  if (!userFk) {
    const fkLabel = `fk_${newName}_user`;
    await pool.execute(
      `ALTER TABLE \`${newName}\`
         ADD CONSTRAINT \`${fkLabel}\` FOREIGN KEY (user_id)
         REFERENCES users(id) ON DELETE CASCADE`,
    );
  }

  // Step 10: add unique key on (user_id, <other>) if missing
  const [uxRows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [newName, newUniqueKeyName],
  );
  if (Number(uxRows[0].cnt) === 0) {
    const cols = uniqueColumns.map((c) => `\`${c}\``).join(", ");
    await pool.execute(
      `ALTER TABLE \`${newName}\` ADD UNIQUE KEY \`${newUniqueKeyName}\` (${cols})`,
    );
  }
}

export async function up(pool) {
  // Drop legacy "user" tables that may have been created at runtime; data migrated to canonical tables.
  for (const legacy of ["customer_service_user", "customer_service_user_contacts"]) {
    if (await tableExists(pool, legacy)) {
      await pool.execute(`DROP TABLE \`${legacy}\``);
    }
  }

  await migrateTable(
    pool,
    "customer_service_owner",
    "customer_service",
    ["user_id", "nama_perintah"],
    "ux_customer_service_user_command",
  );

  await migrateTable(
    pool,
    "customer_service_owner_contacts",
    "customer_service_contacts",
    ["user_id", "contact_jid"],
    "ux_customer_service_contacts_user_jid",
  );
}
