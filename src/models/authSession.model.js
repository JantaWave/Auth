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
    // Calculate expiry if not provided
    const expiryDays = parseInt(
      process.env.REFRESH_TOKEN_EXPIRY_DAYS || "7",
      10,
    );
    const calculatedExpiry =
      expiresAt || new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const q = `
      INSERT INTO user_sessions (user_id, refresh_token_hash, device_info, ip_address, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, device_info, ip_address)
      DO UPDATE SET
        refresh_token_hash = EXCLUDED.refresh_token_hash,
        expires_at = EXCLUDED.expires_at,
        last_activity = NOW()
      RETURNING *;
    `;
    const vals = [userId, refreshTokenHash, deviceInfo, ip, calculatedExpiry];
    const { rows } = await db.query(q, vals);
    return rows[0] || null;
  }

  static async findById(sessionId) {
    const q = `
      SELECT * FROM user_sessions
      WHERE id = $1
    `;
    const { rows } = await db.query(q, [sessionId]);
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

  static async findAllActive() {
    const q = `
      SELECT * FROM user_sessions
      WHERE expires_at > NOW()
      ORDER BY created_at DESC
    `;
    const { rows } = await db.query(q);
    return rows;
  }

  static async updateActivity(sessionId) {
    const q = `
      UPDATE user_sessions 
      SET last_activity = NOW() 
      WHERE id = $1 
      RETURNING *
    `;
    const { rows } = await db.query(q, [sessionId]);
    return rows[0] || null;
  }

  static async revokeSession(sessionId) {
    const q = "DELETE FROM user_sessions WHERE id = $1 RETURNING *";
    const { rows } = await db.query(q, [sessionId]);
    return rows[0] || null;
  }

  static async revokeAllForUser(userId) {
    const q = "DELETE FROM user_sessions WHERE user_id = $1 RETURNING *";
    const { rows } = await db.query(q, [userId]);
    return rows.length;
  }

  static async revokeAllExcept(userId, currentSessionId) {
    const q = `
      DELETE FROM user_sessions 
      WHERE user_id = $1 AND id != $2 
      RETURNING *
    `;
    const { rows } = await db.query(q, [userId, currentSessionId]);
    return rows.length;
  }

  static async cleanupExpired() {
    const q = `
      DELETE FROM user_sessions 
      WHERE expires_at <= NOW() 
      RETURNING *
    `;
    const { rows } = await db.query(q);
    return rows.length;
  }
}

export default UserSessionModel;
