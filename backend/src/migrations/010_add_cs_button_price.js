import { addColumnIfMissing, tableExists } from "./helpers/schema.js";

export async function up(pool) {
  if (!(await tableExists(pool, "cs_buttons"))) {
    return;
  }

  await addColumnIfMissing(pool, "cs_buttons", "price", "INT NULL");

  if (await tableExists(pool, "customer_service")) {
    await pool.execute(`
      UPDATE cs_buttons b
         SET price = cs.price
        FROM customer_service cs
       WHERE b.cs_id = cs.id
         AND b.button_type = 'buy'
         AND b.price IS NULL
         AND cs.price IS NOT NULL
    `);
  }
}
