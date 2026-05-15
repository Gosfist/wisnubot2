import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "cs_transactions",
    "warranty_status",
    "VARCHAR(16) NOT NULL DEFAULT 'open'",
  );
  await addColumnIfMissing(pool, "cs_transactions", "warranty_claimed_at", "TIMESTAMPTZ NULL");
  await addColumnIfMissing(pool, "cs_transactions", "warranty_claim_stock_id", "INT NULL");

  await pool.execute(`
    UPDATE cs_transactions
       SET warranty_status = 'open'
     WHERE warranty_status IS NULL
        OR warranty_status NOT IN ('open', 'selesai')
  `);

  await pool.execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM information_schema.table_constraints
         WHERE table_schema = current_schema()
           AND table_name = 'cs_transactions'
           AND constraint_name = 'chk_cs_tx_warranty_status'
      ) THEN
        ALTER TABLE cs_transactions
          ADD CONSTRAINT chk_cs_tx_warranty_status
          CHECK (warranty_status IN ('open', 'selesai'));
      END IF;
    END $$;
  `);

  await pool.execute(`
    CREATE INDEX IF NOT EXISTS idx_cs_tx_warranty_claim
      ON cs_transactions (user_id, pakasir_order_id, warranty_status)
  `);
}
