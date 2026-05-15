export async function up(pool) {
  await pool.execute(`
    UPDATE cs_transactions
       SET stock_id = NULL
     WHERE stock_id IN (
       SELECT id FROM cs_stocks WHERE is_used = 1
     )
  `);

  await pool.execute(`
    UPDATE cs_transactions
       SET warranty_claim_stock_id = NULL
     WHERE warranty_claim_stock_id IN (
       SELECT id FROM cs_stocks WHERE is_used = 1
     )
  `);

  await pool.execute(`
    DELETE FROM cs_stocks
     WHERE is_used = 1
  `);
}
