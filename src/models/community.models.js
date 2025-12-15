import { db } from "../config/db.js";

class CommunityModel {
  // Return only one row
  static async _single(query, params) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  // Return multiple rows
  static async _many(query, params) {
    const { rows } = await db.query(query, params);
    return rows;
  }

  /**
   * FOLLOW USER
   * followerId → logged-in user
   * followingId → target user
   */
  static async follow(followerId, targetUserId) {
    const query = `
      INSERT INTO follows (follower_id, following_id)
      VALUES ($1, $2)
      ON CONFLICT (follower_id, following_id) DO NOTHING
      RETURNING id;
    `;
    return await this._single(query, [followerId, targetUserId]);
  }

  static async unfollow(followerId, targetUserId) {
    const query = `
      DELETE FROM follows 
      WHERE follower_id = $1 AND following_id = $2
      RETURNING id;
    `;
    return await this._single(query, [followerId, targetUserId]);
  }

  /**
   * GET USER FOLLOWERS (Returns an array)
   */
  static async getUserFollowers(userId) {
    return await this._many(
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
    );
  }

  /**
   * GET USERS THE USER FOLLOWS (Returns an array)
   */
  static async getUserFollowings(userId) {
    return await this._many(
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
    );
  }

  static async getProfileStats(userId) {
    return await this._single(
      `SELECT * FROM leader_profile_stats lps WHERE lps.user_id=$1`,
      [userId],
    );
  }
}

export default CommunityModel;
