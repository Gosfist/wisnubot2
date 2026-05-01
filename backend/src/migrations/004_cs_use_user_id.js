/**
 * 004 - Simplify customer service tables.
 *
 * Why: 1 user = 1 bot, so CS data should be tied to the user instead of the bot.
 * A bot can be replaced or re-paired without losing CS configuration.
 *
 * Changes:
 *  - Rename `customer_service_owner` -> `customer_service`
 *  - Rename `customer_service_owner_contacts` -> `customer_service_contacts`
 *  - Replace `bot_id` with `user_id` in both tables
 *  - Backfill `user_id` from `bots.user_id`
 *  - Update unique keys to use `user_id`
 *
 * Idempotent: safely re-runs by checking column and table state.
 */

import {
  columnExists,
  foreignKeyName,
  indexExists,
  tableExists,
  uniqueIndexNameForColumn,
} from "./helpers/schema.js";

async function migrateTable(pool, oldName, newName, uniqueColumns, newUniqueKeyName) {
  if ((await tableExists(pool, oldName)) && !(await tableExists(pool, newName))) {
    await pool.execute(`RENAME TABLE \`${oldName}\` TO \`${newName}\``);
  }

  if (!(await tableExists(pool, newName))) {
    return;
  }

  if (!(await columnExists(pool, newName, "user_id"))) {
    await pool.execute(
      `ALTER TABLE \`${newName}\` ADD COLUMN user_id INT NULL AFTER id`,
    );
  }

  if (await columnExists(pool, newName, "bot_id")) {
    await pool.execute(
      `UPDATE \`${newName}\` cs
         JOIN bots b ON b.id = cs.bot_id
          SET cs.user_id = b.user_id
        WHERE cs.user_id IS NULL`,
    );

    const fkName = await foreignKeyName(pool, newName, "bot_id");
    if (fkName) {
      await pool.execute(`ALTER TABLE \`${newName}\` DROP FOREIGN KEY \`${fkName}\``);
    }

    const idxName = await uniqueIndexNameForColumn(pool, newName, "bot_id");
    if (idxName) {
      await pool.execute(`ALTER TABLE \`${newName}\` DROP INDEX \`${idxName}\``);
    }

    await pool.execute(`ALTER TABLE \`${newName}\` DROP COLUMN bot_id`);
  }

  await pool.execute(`DELETE FROM \`${newName}\` WHERE user_id IS NULL`);
  await pool.execute(
    `ALTER TABLE \`${newName}\` MODIFY COLUMN user_id INT NOT NULL`,
  );

  const userFk = await foreignKeyName(pool, newName, "user_id");
  if (!userFk) {
    await pool.execute(
      `ALTER TABLE \`${newName}\`
         ADD CONSTRAINT \`fk_${newName}_user\` FOREIGN KEY (user_id)
         REFERENCES users(id) ON DELETE CASCADE`,
    );
  }

  if (!(await indexExists(pool, newName, newUniqueKeyName))) {
    const cols = uniqueColumns.map((column) => `\`${column}\``).join(", ");
    await pool.execute(
      `ALTER TABLE \`${newName}\` ADD UNIQUE KEY \`${newUniqueKeyName}\` (${cols})`,
    );
  }
}

export async function up(pool) {
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
