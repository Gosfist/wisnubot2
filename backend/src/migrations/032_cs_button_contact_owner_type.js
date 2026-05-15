export async function up(pool) {
  await pool.execute(`
    DO $$
    DECLARE
      constraint_name TEXT;
    BEGIN
      FOR constraint_name IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE t.relname = 'cs_buttons'
           AND n.nspname = current_schema()
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) ILIKE '%button_type%'
      LOOP
        EXECUTE format('ALTER TABLE cs_buttons DROP CONSTRAINT %I', constraint_name);
      END LOOP;

      ALTER TABLE cs_buttons
        ADD CONSTRAINT chk_cs_buttons_button_type
        CHECK (button_type IN ('link', 'buy', 'url', 'reply', 'contact_owner'));
    END $$;
  `);
}
