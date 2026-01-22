import { db } from "../config/db.js";

class PushTokenModel {
  static async save(userId, expoPushToken) {
    await db.query(
      `
      INSERT INTO user_push_tokens (user_id, expo_push_token)
      VALUES ($1, $2)
      ON CONFLICT (expo_push_token) DO UPDATE
      SET user_id = EXCLUDED.user_id
      `,
      [userId, expoPushToken],
    );
  }

  static async getTokensByUserId(userId) {
    const { rows } = await db.query(
      `SELECT expo_push_token FROM user_push_tokens WHERE user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.expo_push_token);
  }
}

export default PushTokenModel;
