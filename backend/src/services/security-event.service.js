import { logger } from "../utils/logger.js";

export async function logSecurityEvent(pool, { userId = null, username = "", eventType, req = null, detail = "" }) {
  try {
    await pool.execute(
      `INSERT INTO security_events (user_id, username, event_type, ip_address, user_agent, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId ? Number(userId) : null,
        username ? String(username) : null,
        String(eventType),
        req?.ip ? String(req.ip) : null,
        req?.get ? String(req.get("user-agent") ?? "") : null,
        detail ? String(detail) : null,
      ],
    );
  } catch (err) {
    logger.warn(err, `Security event log failed: ${eventType}`);
  }
}
