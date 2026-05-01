import bcrypt from "bcrypt";

async function seedAdmin(pool) {
  const [rows] = await pool.execute("SELECT id FROM users LIMIT 1");

  if (rows.length === 0) {
    const hash = await bcrypt.hash("123", 10);
    await pool.execute(
      `INSERT INTO users (username, "password") VALUES (?, ?)`,
      ["admin", hash],
    );
  }
}

export async function up(pool) {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      "password" VARCHAR(255) NOT NULL,
      is_active SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ux_users_username UNIQUE (username)
    )`,

    `CREATE TABLE IF NOT EXISTS bots (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      phone_number VARCHAR(20) NULL,
      owner_phone_number VARCHAR(20) NULL,
      session_name VARCHAR(100) NOT NULL,
      is_online SMALLINT NOT NULL DEFAULT 0,
      expired_at TIMESTAMP NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ux_bots_session_name UNIQUE (session_name),
      CONSTRAINT fk_bots_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS "groups" (
      id SERIAL PRIMARY KEY,
      bot_id INT NOT NULL,
      group_jid VARCHAR(100) NOT NULL,
      name VARCHAR(200) NOT NULL,
      member_count INT NOT NULL DEFAULT 0,
      is_active SMALLINT NOT NULL DEFAULT 1,
      joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_groups_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS broadcasts (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      message_text TEXT NOT NULL,
      image_url VARCHAR(500) NULL,
      target_group_ids JSONB NULL,
      target_excluded_group_ids JSONB NULL,
      target_bot_ids JSONB NULL,
      schedule_time TEXT NULL,
      schedule_days JSONB NULL,
      is_active SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_broadcasts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      action VARCHAR(100) NOT NULL,
      detail TEXT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_activity_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS customer_service (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      nama_perintah VARCHAR(100) NOT NULL,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ux_customer_service_user_command UNIQUE (user_id, nama_perintah),
      CONSTRAINT fk_customer_service_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS customer_service_contacts (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      contact_jid VARCHAR(120) NOT NULL,
      first_replied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ux_customer_service_contacts_user_jid UNIQUE (user_id, contact_jid),
      CONSTRAINT fk_customer_service_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ];

  for (const query of queries) {
    await pool.execute(query);
  }

  await seedAdmin(pool);
}
