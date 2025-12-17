import { db } from "../config/db.js";

class StreamModel {
  /* ---------------- HELPERS ---------------- */
  static async _single(query, params = []) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  static async _many(query, params = []) {
    const { rows } = await db.query(query, params);
    return rows;
  }

  /* ---------------- CREATE ---------------- */
  static async add(session) {
    await db.query(
      `INSERT INTO streams
       (id, user_id, title, description, thumbnail_url, scheduled_start_time,
        youtube_key, facebook_key, instagram_key, overlays, share_urls, status, token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'scheduled',$12)`,
      [
        session.id,
        session.userId,
        session.title,
        session.description,
        session.thumbnailUrl,
        session.scheduledStartTime,
        session.youtubeKey,
        session.facebookKey,
        session.instagramKey,
        JSON.stringify(session.overlays),
        JSON.stringify(session.shareUrls),
        session.token,
      ],
    );
  }

  /* ---------------- GET USER STREAMS ---------------- */
  static async getAllUserStreams(userId) {
    return this._many(
      `SELECT *
       FROM streams
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
  }

  /* ---------------- GET SINGLE STREAM ---------------- */
  static async get(sessionId) {
    return this._single(
      `SELECT *
       FROM streams
       WHERE id = $1`,
      [sessionId],
    );
  }

  /* ---------------- UPDATE STATUS ---------------- */
  static async updateStatus(sessionId, status) {
    await db.query(
      `UPDATE streams
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, sessionId],
    );
  }

  /* ---------------- FEED FOR USER (BLOCK / FOLLOW) ---------------- */
  static async getStreamsForUser(userId) {
    return this._many(
      `SELECT
      s.id,
      s.title,
      s.status,
      s.scheduled_start_time,
      s.thumbnail_url,
      COALESCE(s.share_urls, '{}'::jsonb) AS share_urls, 
      s.user_id,
      s.created_at,
      u.first_name,
      u.last_name,
      u.avatar_url,
      b.block_id
    FROM streams s
    JOIN users u ON u.id = s.user_id
    JOIN villages v_leader ON v_leader.village_id = u.village_id
    JOIN blocks b ON b.block_id = v_leader.block_id
    WHERE u.role = 'leader'
      AND s.user_id != $1
      AND (
        -- Same block
        b.block_id = (
          SELECT v_user.block_id
          FROM users u_user
          JOIN villages v_user ON v_user.village_id = u_user.village_id
          WHERE u_user.id = $1
        )
        OR
        -- Followed leader
        EXISTS (
          SELECT 1
          FROM follows f
          WHERE f.follower_id = $1
            AND f.following_id = u.id
        )
      )
    ORDER BY 
      CASE 
        WHEN s.status = 'live' THEN 0
        WHEN s.status = 'scheduled' THEN 1
        ELSE 2
      END,
      s.created_at DESC`,
      [userId],
    );
  }
}

export default StreamModel;
