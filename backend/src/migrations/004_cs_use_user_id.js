/**
 * 004 - Simplify customer service tables.
 *
 * Keeps old MySQL-era customer_service_owner tables upgradeable, while new
 * PostgreSQL installs already start with the final user_id-based table names.
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
    await pool.execute(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
  }

  if (!(await tableExists(pool, newName))) {
    return;
  }

  if (!(await columnExists(pool, newName, "user_id"))) {
    await pool.execute(`ALTER TABLE "${newName}" ADD COLUMN user_id INT NULL`);
  }

  if (await columnExists(pool, newName, "bot_id")) {
    await pool.execute(
      `UPDATE "${newName}" cs
          SET user_id = b.user_id
         FROM bots b
        WHERE b.id = cs.bot_id
          AND cs.user_id IS NULL`,
    );

    const fkName = await foreignKeyName(pool, newName, "bot_id");
    if (fkName) {
      await pool.execute(`ALTER TABLE "${newName}" DROP CONSTRAINT "${fkName}"`);
    }

    const idxName = await uniqueIndexNameForColumn(pool, newName, "bot_id");
    if (idxName) {
      await pool.execute(`DROP INDEX IF EXISTS "${idxName}"`);
    }

    await pool.execute(`ALTER TABLE "${newName}" DROP COLUMN bot_id`);
  }

  await pool.execute(`DELETE FROM "${newName}" WHERE user_id IS NULL`);
  await pool.execute(`ALTER TABLE "${newName}" ALTER COLUMN user_id SET NOT NULL`);

  const userFk = await foreignKeyName(pool, newName, "user_id");
  if (!userFk) {
    await pool.execute(
      `ALTER TABLE "${newName}"
         ADD CONSTRAINT "fk_${newName}_user" FOREIGN KEY (user_id)
         REFERENCES users(id) ON DELETE CASCADE`,
    );
  }

  if (!(await indexExists(pool, newName, newUniqueKeyName))) {
    const cols = uniqueColumns.map((column) => `"${column}"`).join(", ");
    await pool.execute(
      `ALTER TABLE "${newName}" ADD CONSTRAINT "${newUniqueKeyName}" UNIQUE (${cols})`,
    );
  }
}

export async function up(pool) {
  for (const legacy of ["customer_service_user", "customer_service_user_contacts"]) {
    if (await tableExists(pool, legacy)) {
      await pool.execute(`DROP TABLE "${legacy}"`);
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
