import { db } from "../config/db.js";

class PostModel {
  static async _single(query, params) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  static async _many(query, params) {
    const { rows } = await db.query(query, params);
    return rows;
  }

  // --------------------------------------------------
  // CREATE POST
  // --------------------------------------------------
  static async addPost(userId, title, content, mediaUrl, mediaType, villages) {
    const result = await this._single(
      `INSERT INTO posts 
        (user_id, title, content, media_url, media_type, villages)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        title,
        content,
        mediaUrl,
        mediaType,
        JSON.stringify(villages || []),
      ],
    );

    return result;
  }

  // --------------------------------------------------
  // GET USER POSTS WITH LIKE/COMMENT COUNT
  // --------------------------------------------------
  static async getUserPosts(userId) {
    const posts = await this._many(
      `SELECT 
        p.*,
        (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
        EXISTS (
          SELECT 1 FROM post_likes pl
          WHERE pl.post_id = p.id AND pl.user_id = $1
        ) AS is_liked
       FROM posts p
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId],
    );

    return posts;
  }

  // --------------------------------------------------
  // CHECK IF USER LIKED A POST
  // --------------------------------------------------
  static async isPostLikedByUser(postId, userId) {
    const result = await this._single(
      `SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2`,
      [postId, userId],
    );

    return { liked: !!result };
  }

  // --------------------------------------------------
  // LIKE POST
  // --------------------------------------------------
  static async likePost(userId, postId) {
    await db.query(
      `INSERT INTO post_likes (post_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [postId, userId],
    );

    return { liked: true };
  }

  // --------------------------------------------------
  // DISLIKE POST
  // --------------------------------------------------
  static async dislikePost(userId, postId) {
    await db.query(
      `DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`,
      [postId, userId],
    );

    return { liked: false };
  }

  // --------------------------------------------------
  // GET POST COMMENTS
  // --------------------------------------------------
  static async getPostComments(postId) {
    const comments = await this._many(
      `SELECT pc.*, u.first_name, u.last_name, u.avatar_url
       FROM post_comments pc
       JOIN users u ON pc.user_id = u.id
       WHERE pc.post_id = $1
       ORDER BY pc.created_at ASC`,
      [postId],
    );

    return comments;
  }
}

export default PostModel;
