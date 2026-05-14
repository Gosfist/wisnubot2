function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function parseIdList(value) {
  return [
    ...new Set(
      parseJsonList(value)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  ];
}

function parseScheduleEntries(scheduleTime, scheduleDays) {
  const times = parseJsonList(scheduleTime);
  const fallbackDays = parseJsonList(scheduleDays).map((day) => String(day).trim()).filter(Boolean);

  if (times.length === 0) return [];

  return times
    .map((entry, index) => {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const time = String(entry.time ?? "").trim();
        const days = parseJsonList(entry.days).map((day) => String(day).trim()).filter(Boolean);
        return { time, days, position: index };
      }

      return {
        time: String(entry ?? "").trim(),
        days: fallbackDays,
        position: index,
      };
    })
    .filter((entry) => entry.time && entry.days.length > 0);
}

async function constraintExists(pool, constraintName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.table_constraints
      WHERE table_schema = current_schema()
        AND constraint_name = ?`,
    [constraintName],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function addForeignKeyIfMissing(pool, constraintName, sql) {
  if (await constraintExists(pool, constraintName)) return;
  await pool.execute(sql);
}

async function backfillBroadcastRelations(pool) {
  const [broadcasts] = await pool.execute(
    `SELECT id, target_group_ids, target_excluded_group_ids, target_bot_ids, schedule_time, schedule_days
       FROM broadcasts`,
  );

  for (const broadcast of broadcasts) {
    const broadcastId = Number(broadcast.id);

    for (const groupId of parseIdList(broadcast.target_group_ids)) {
      await pool.execute(
        `INSERT INTO broadcast_target_groups (broadcast_id, group_id)
         SELECT ?, g.id FROM "groups" g WHERE g.id = ?
         ON CONFLICT DO NOTHING`,
        [broadcastId, groupId],
      );
    }

    for (const groupId of parseIdList(broadcast.target_excluded_group_ids)) {
      await pool.execute(
        `INSERT INTO broadcast_excluded_groups (broadcast_id, group_id)
         SELECT ?, g.id FROM "groups" g WHERE g.id = ?
         ON CONFLICT DO NOTHING`,
        [broadcastId, groupId],
      );
    }

    for (const botId of parseIdList(broadcast.target_bot_ids)) {
      await pool.execute(
        `INSERT INTO broadcast_target_bots (broadcast_id, bot_id)
         SELECT ?, b.id FROM bots b WHERE b.id = ?
         ON CONFLICT DO NOTHING`,
        [broadcastId, botId],
      );
    }

    for (const entry of parseScheduleEntries(broadcast.schedule_time, broadcast.schedule_days)) {
      for (const dayKey of entry.days) {
        await pool.execute(
          `INSERT INTO broadcast_schedule_entries (broadcast_id, schedule_time, day_key, position)
           VALUES (?, ?, ?, ?)
           ON CONFLICT DO NOTHING`,
          [broadcastId, entry.time, dayKey, entry.position],
        );
      }
    }
  }
}

export async function up(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS broadcast_target_groups (
      broadcast_id INT NOT NULL,
      group_id INT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (broadcast_id, group_id),
      CONSTRAINT fk_broadcast_target_groups_broadcast FOREIGN KEY (broadcast_id)
        REFERENCES broadcasts(id) ON DELETE CASCADE,
      CONSTRAINT fk_broadcast_target_groups_group FOREIGN KEY (group_id)
        REFERENCES "groups"(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS broadcast_excluded_groups (
      broadcast_id INT NOT NULL,
      group_id INT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (broadcast_id, group_id),
      CONSTRAINT fk_broadcast_excluded_groups_broadcast FOREIGN KEY (broadcast_id)
        REFERENCES broadcasts(id) ON DELETE CASCADE,
      CONSTRAINT fk_broadcast_excluded_groups_group FOREIGN KEY (group_id)
        REFERENCES "groups"(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS broadcast_target_bots (
      broadcast_id INT NOT NULL,
      bot_id INT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (broadcast_id, bot_id),
      CONSTRAINT fk_broadcast_target_bots_broadcast FOREIGN KEY (broadcast_id)
        REFERENCES broadcasts(id) ON DELETE CASCADE,
      CONSTRAINT fk_broadcast_target_bots_bot FOREIGN KEY (bot_id)
        REFERENCES bots(id) ON DELETE CASCADE
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS broadcast_schedule_entries (
      broadcast_id INT NOT NULL,
      schedule_time VARCHAR(5) NOT NULL,
      day_key VARCHAR(20) NOT NULL,
      position INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (broadcast_id, schedule_time, day_key),
      CONSTRAINT fk_broadcast_schedule_entries_broadcast FOREIGN KEY (broadcast_id)
        REFERENCES broadcasts(id) ON DELETE CASCADE
    )
  `);

  await backfillBroadcastRelations(pool);

  await pool.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_groups_bot_jid
       ON "groups" (bot_id, group_jid)`,
  );
  await pool.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_google_accounts_user_email
       ON google_accounts (user_id, lower(email))`,
  );
  await pool.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_gemini_price_user_label
       ON gemini_price_plans (user_id, lower(label))`,
  );

  await addForeignKeyIfMissing(
    pool,
    "fk_cs_tx_google_account",
    `ALTER TABLE cs_transactions
       ADD CONSTRAINT fk_cs_tx_google_account FOREIGN KEY (google_account_id)
       REFERENCES google_accounts(id) ON DELETE SET NULL`,
  );

  await addForeignKeyIfMissing(
    pool,
    "fk_cs_tx_gemini_price_plan",
    `ALTER TABLE cs_transactions
       ADD CONSTRAINT fk_cs_tx_gemini_price_plan FOREIGN KEY (gemini_price_plan_id)
       REFERENCES gemini_price_plans(id) ON DELETE SET NULL`,
  );
}
