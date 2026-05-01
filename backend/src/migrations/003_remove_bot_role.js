import { columnExists, tableExists } from "./helpers/schema.js";

export async function up(pool) {
  const hasBotsTable = await tableExists(pool, "bots");
  const hasBotRoleColumn =
    hasBotsTable && (await columnExists(pool, "bots", "bot_role"));

  if (hasBotRoleColumn) {
    await pool.execute(`ALTER TABLE bots DROP COLUMN bot_role`);
  }
}
