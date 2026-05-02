import { tableExists } from "./helpers/schema.js";

export async function up(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS push_contact_templates (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(160) NOT NULL,
      message_text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_push_templates_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS group_push_exclusions (
      id SERIAL PRIMARY KEY,
      group_id INT NOT NULL,
      phone_number VARCHAR(32) NOT NULL,
      label VARCHAR(160) NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_group_push_exclusions_group FOREIGN KEY (group_id)
        REFERENCES "groups"(id) ON DELETE CASCADE,
      CONSTRAINT ux_group_push_exclusion UNIQUE (group_id, phone_number)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS push_contact_runs (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      template_id INT NULL,
      group_id INT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'running'
        CHECK (status IN ('running','done','failed')),
      total_targets INT NOT NULL DEFAULT 0,
      success_count INT NOT NULL DEFAULT 0,
      failed_count INT NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMPTZ NULL,
      CONSTRAINT fk_push_runs_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_push_runs_template FOREIGN KEY (template_id)
        REFERENCES push_contact_templates(id) ON DELETE SET NULL,
      CONSTRAINT fk_push_runs_group FOREIGN KEY (group_id)
        REFERENCES "groups"(id) ON DELETE SET NULL
    )
  `);

  if (await tableExists(pool, "push_contact_templates")) {
    await pool.execute(`CREATE INDEX IF NOT EXISTS idx_push_templates_user ON push_contact_templates (user_id)`);
  }
  if (await tableExists(pool, "group_push_exclusions")) {
    await pool.execute(`CREATE INDEX IF NOT EXISTS idx_group_push_exclusions_group ON group_push_exclusions (group_id)`);
  }
  if (await tableExists(pool, "push_contact_runs")) {
    await pool.execute(`CREATE INDEX IF NOT EXISTS idx_push_runs_user ON push_contact_runs (user_id, started_at)`);
  }
}
