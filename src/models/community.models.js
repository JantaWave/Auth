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
  static async follow(followerId, followingId) {
    await db.query(
      `INSERT INTO follows (follower_id, following_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [followerId, followingId],
    );

    return { success: true };
  }

  /**
   * UNFOLLOW USER
   */
  static async unfollow(followerId, followingId) {
    await db.query(
      `DELETE FROM follows 
       WHERE follower_id = $1 AND following_id = $2`,
      [followerId, followingId],
    );

    return { success: true };
  }

  /**
   * GET USER FOLLOWERS (Returns an array)
   */
  static async getUserFollowers(userId) {
    return await this._many(
      `SELECT follower_id FROM follows WHERE following_id = $1`,
      [userId],
    );
  }

  /**
   * GET USERS THE USER FOLLOWS (Returns an array)
   */
  static async getUserFollowings(userId) {
    return await this._many(
      `SELECT following_id FROM follows WHERE follower_id = $1`,
      [userId],
    );
  }
}

export default CommunityModel;
