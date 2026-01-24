import { db } from "../config/db.js";

class NotificationModel {
  static async create(userId, { title, body, data = {}, type = "general" }) {
    const q = `
      INSERT INTO user_notifications (user_id, title, body, data, type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const { rows } = await db.query(q, [userId, title, body, data, type]);
    return rows[0];
  }

  static async listByUserId(userId, limit = 20, offset = 0) {
    const q = `
      SELECT id, title, body, data, type, is_read, created_at
      FROM user_notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await db.query(q, [userId, limit, offset]);
    return rows;
  }

  static async countUnread(userId) {
    const q = `
      SELECT COUNT(*)::int AS unread_count
      FROM user_notifications
      WHERE user_id = $1 AND is_read = false
    `;
    const { rows } = await db.query(q, [userId]);
    return rows[0]?.unread_count || 0;
  }

  static async markRead(userId, notificationId) {
    const q = `
      UPDATE user_notifications
      SET is_read = true
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    const { rows } = await db.query(q, [notificationId, userId]);
    return rows[0] || null;
  }

  static async markAllRead(userId) {
    const q = `
      UPDATE user_notifications
      SET is_read = true
      WHERE user_id = $1 AND is_read = false
      RETURNING id
    `;
    const { rows } = await db.query(q, [userId]);
    return rows.length;
  }

  static async deleteById(userId, notificationId) {
    const q = `
      DELETE FROM user_notifications
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;
    const { rows } = await db.query(q, [notificationId, userId]);
    return rows[0] || null;
  }
}

export default NotificationModel;
