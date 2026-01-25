import { db } from "../config/db.js";
import { getOrSetCache, invalidate } from "../utils/cache.js";

class CommunityModel {
  static async _single(query, params) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  static async _many(query, params) {
    const { rows } = await db.query(query, params);
    return rows;
  }

  /* ------------------------------------
     FOLLOW / UNFOLLOW (NO CACHE)
     ------------------------------------ */

  static async follow(followerId, targetUserId) {
    const result = await this._single(
      `
      INSERT INTO follows (follower_id, following_id)
      VALUES ($1, $2)
      ON CONFLICT (follower_id, following_id) DO NOTHING
      RETURNING id;
      `,
      [followerId, targetUserId],
    );

    await invalidate([
      `followers:${targetUserId}`,
      `followings:${followerId}`,
      `leader:stats:${targetUserId}`,
    ]);

    return result;
  }

  static async unfollow(followerId, targetUserId) {
    const result = await this._single(
      `
      DELETE FROM follows 
      WHERE follower_id = $1 AND following_id = $2
      RETURNING id;
      `,
      [followerId, targetUserId],
    );

    await invalidate([
      `followers:${targetUserId}`,
      `followings:${followerId}`,
      `leader:stats:${targetUserId}`,
    ]);

    return result;
  }

  static async removeFollower(leaderId, followerId) {
    const result = await this._single(
      `
    DELETE FROM follows
    WHERE follower_id = $1
      AND following_id = $2
    RETURNING id
    `,
      [followerId, leaderId],
    );

    await invalidate([
      `followers:${leaderId}`,
      `followings:${followerId}`,
      `leader:stats:${leaderId}`,
    ]);

    return result;
  }

  /* ------------------------------------
     FOLLOWERS (CACHED)
     ------------------------------------ */

  static async getUserFollowers(userId) {
    return getOrSetCache(
      `followers:${userId}`,
      30,
      async () =>
        await this._many(
          `
          SELECT
            u.id,
            u.first_name,
            u.last_name,
            u.avatar_url,
            u.role
          FROM follows f
          JOIN users u ON u.id = f.follower_id
          WHERE f.following_id = $1
          ORDER BY f.created_at DESC
          `,
          [userId],
        ),
    );
  }

  /* ------------------------------------
     FOLLOWINGS (CACHED)
     ------------------------------------ */

  static async getUserFollowings(userId) {
    return getOrSetCache(
      `followings:${userId}`,
      30,
      async () =>
        await this._many(
          `
          SELECT
            u.id,
            u.first_name,
            u.last_name,
            u.avatar_url,
            u.role
          FROM follows f
          JOIN users u ON u.id = f.following_id
          WHERE f.follower_id = $1
          ORDER BY f.created_at DESC
          `,
          [userId],
        ),
    );
  }

  /* ------------------------------------
     LEADER PROFILE STATS (CACHED)
     ------------------------------------ */

  static async getProfileStats(userId) {
    return getOrSetCache(
      `leader:stats:${userId}`,
      60,
      async () =>
        await this._single(
          `SELECT * FROM leader_profile_stats WHERE user_id = $1`,
          [userId],
        ),
    );
  }
  static async getFollowerIds(userId) {
    const { rows } = await db.query(
      `SELECT DISTINCT follower_id FROM follows WHERE following_id = $1`,
      [userId],
    );
    return rows.map((r) => r.follower_id);
  }
}

export default CommunityModel;
