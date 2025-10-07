import { db } from "../config/db.js";
import dotenv from "dotenv";
dotenv.config();

class UserSessionModel {
  static async upsert(
    userId,
    refreshTokenHash,
    deviceInfo = {},
    ip = null,
    expiresAt = null,
  ) {
    const q = `
      INSERT INTO user_sessions (user_id, refresh_token_hash, device_info, ip_address, expires_at)
      VALUES ($1, $2, $3, $4, COALESCE($5, NOW() + ($6::int) * interval '1 day'))
      ON CONFLICT (user_id, device_info, ip_address)
      DO UPDATE SET
        refresh_token_hash = EXCLUDED.refresh_token_hash,
        expires_at = EXCLUDED.expires_at,
        last_activity = NOW()
      RETURNING *;
    `;

    const vals = [
      userId,
      refreshTokenHash,
      deviceInfo,
      ip,
      expiresAt,
      process.env.REFRESH_TOKEN_EXPIRY_DAYS,
    ];
    const { rows } = await db.query(q, vals);
    return rows[0] || null;
  }

  static async findLatestActiveForUser(userId) {
    const q = `
      SELECT * FROM user_sessions
      WHERE user_id = $1 AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const { rows } = await db.query(q, [userId]);
    return rows[0] || null;
  }

  static async findAllActiveForUser(userId) {
    const q = `
    SELECT * FROM user_sessions
    WHERE user_id = $1 AND expires_at > NOW()
    ORDER BY created_at DESC
  `;
    const { rows } = await db.query(q, [userId]);
    return rows;
  }

  static async revokeSession(sessionId) {
    const q = "DELETE FROM user_sessions WHERE id = $1 RETURNING *";
    const { rows } = await db.query(q, [sessionId]);
    return rows[0] || null;
  }

  static async revokeAllForUser(userId) {
    await db.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
    return true;
  }
}

export default UserSessionModel;
