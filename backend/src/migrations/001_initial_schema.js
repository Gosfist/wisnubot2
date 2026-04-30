import bcrypt from "bcrypt";

async function seedAdmin(pool) {
  const [rows] = await pool.execute(
    "SELECT id FROM users LIMIT 1",
  );

  if (rows.length === 0) {
    const hash = await bcrypt.hash("123", 10);
    await pool.execute(
      "INSERT INTO users (username, `password`) VALUES (?, ?)",
      ["admin", hash],
    );
  }
}

export async function up(pool) {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      \`password\` VARCHAR(255) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY ux_users_username (username)
    )`,

    `CREATE TABLE IF NOT EXISTS bots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      phone_number VARCHAR(20) NULL,
      session_name VARCHAR(100) NOT NULL,
      is_online TINYINT(1) NOT NULL DEFAULT 0,
      bot_role ENUM('default', 'broadcast', 'service') NOT NULL DEFAULT 'broadcast',
      expired_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY ux_bots_session_name (session_name),
      CONSTRAINT fk_bots_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS \`groups\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bot_id INT NOT NULL,
      group_jid VARCHAR(100) NOT NULL,
      name VARCHAR(200) NOT NULL,
      member_count INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_groups_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS broadcasts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      message_text TEXT NOT NULL,
      image_url VARCHAR(500) NULL,
      target_group_ids JSON NULL,
      target_excluded_group_ids JSON NULL,
      target_bot_ids JSON NULL,
      schedule_time TEXT NULL,
      schedule_days JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_broadcasts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS activity_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      action VARCHAR(100) NOT NULL,
      detail TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_activity_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS customer_service_owner (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bot_id INT NOT NULL,
      nama_perintah VARCHAR(100) NOT NULL,
      value TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY ux_customer_service_owner_bot_command (bot_id, nama_perintah),
      CONSTRAINT fk_customer_service_owner_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS customer_service_owner_contacts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bot_id INT NOT NULL,
      contact_jid VARCHAR(120) NOT NULL,
      first_replied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY ux_customer_service_owner_contacts_bot_contact (bot_id, contact_jid),
      CONSTRAINT fk_customer_service_owner_contacts_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
    )`,
  ];

  for (const query of queries) {
    await pool.execute(query);
  }

  await seedAdmin(pool);
}
