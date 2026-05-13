import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "cs_transactions",
    "member_status",
    "VARCHAR(16) NOT NULL DEFAULT 'anggota'",
  );
}
