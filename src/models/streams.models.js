import { db } from "../config/db.js";
import { getOrSetCache, invalidate } from "../utils/cache.js";

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
    // 🔥 Invalidate feed caches
    await invalidate([`streams:feed:*`]);
  }

  /* ---------------- USER STREAMS WITH PAGINATION ---------------- */
  static async getAllUserStreams(userId, limit = 10, cursor = null) {
    const streams = await this._many(
      `SELECT *
       FROM streams
       WHERE user_id = $1
         AND ($3::timestamp IS NULL OR created_at < $3)
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit, cursor],
    );

    let nextCursor = null;
    if (streams.length === limit) {
      nextCursor = streams[streams.length - 1].created_at;
    }

    return {
      streams,
      nextCursor,
    };
  }
  /* ---------------- SINGLE STREAM ---------------- */
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
    // 🔥 Invalidate all user feeds
    await invalidate([`streams:feed:*`]);
  }

  /* ---------------- FEED (BLOCK / FOLLOW) WITH PAGINATION ---------------- */
  static async getStreamsForUser(userId, limit = 10, cursor = null) {
    const cacheKey = `streams:feed:${userId}:l${limit}:c${cursor || "first"}`;

    return getOrSetCache(
      cacheKey,
      20, // ⏱ short TTL for live accuracy
      async () => {
        const streams = await this._many(
          `WITH requester_block AS (
  SELECT block_id
  FROM leader_block_map
  WHERE user_id = $1
)
SELECT
  s.id,
  s.title,
  s.status,
  s.scheduled_start_time,
  s.thumbnail_url,
  s.created_at,
  COALESCE(s.share_urls, '{}'::jsonb) AS share_urls,
  s.user_id,
  u.first_name,
  u.last_name,
  u.avatar_url,
  lb.block_id
FROM streams s
JOIN leader_block_map lb
  ON lb.user_id = s.user_id
JOIN users u
  ON u.id = s.user_id
LEFT JOIN follows f
  ON f.following_id = s.user_id
 AND f.follower_id = $1
JOIN requester_block rb ON TRUE
WHERE s.user_id != $1
  AND (
    lb.block_id = rb.block_id
    OR f.follower_id IS NOT NULL
  )
  AND ($3::timestamp IS NULL OR s.created_at < $3)
ORDER BY
  CASE s.status
    WHEN 'live' THEN 0
    WHEN 'scheduled' THEN 1
    ELSE 2
  END,
  s.created_at DESC
LIMIT $2;
`,
          [userId, limit, cursor],
        );

        return {
          streams,
          nextCursor: streams.length
            ? streams[streams.length - 1].created_at
            : null,
        };
      },
    );
  }

  static async getStreamsFromToken(token) {
    const result = await this._single(
      `SELECT * FROM streams WHERE token = $1 LIMIT 1`,
      [token],
    );
    return result;
  }
}

export default StreamModel;
