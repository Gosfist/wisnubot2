import { addColumnIfMissing } from "./helpers/schema.js";

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "bots",
    "owner_phone_number",
    "VARCHAR(20) NULL AFTER phone_number",
  );
}
