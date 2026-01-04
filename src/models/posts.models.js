import { db } from "../config/db.js";
import { getOrSetCache, invalidate } from "../utils/cache.js";
import ActivityModel from "./activity.models.js";

class PostModel {
  /* ---------------- HELPERS ---------------- */
  static async _single(query, params = []) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  static async _many(query, params = []) {
    const { rows } = await db.query(query, params);
    return rows;
  }

  /* ---------------- CREATE POST ---------------- */
  static async addPost(userId, title, content, mediaUrl, mediaType, villages) {
    const post = await this._single(
      `
      INSERT INTO posts (
        user_id, title, content, media_url, media_type, villages,
        likes_count, comments_count
      )
      VALUES ($1,$2,$3,$4,$5,$6,0,0)
      RETURNING *
      `,
      [
        userId,
        title,
        content,
        mediaUrl,
        mediaType,
        JSON.stringify(villages || []),
      ],
    );

    await invalidate([`posts:feed:*`]);

    return post;
  }

  /* ---------------- CHECK IF LIKED ---------------- */
  static async isPostLikedByUser(postId, userId) {
    const result = await this._single(
      `
    SELECT EXISTS (
      SELECT 1 
      FROM post_likes 
      WHERE post_id = $1 AND user_id = $2
    ) AS liked
    `,
      [postId, userId],
    );

    return result || { liked: false };
  }

  /* ---------------- LIKE / DISLIKE ---------------- */

  static async likePost(userId, postId) {
    const result = await db.query(
      `
    INSERT INTO post_likes (post_id, user_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
    `,
      [postId, userId],
    );

    if (result.rowCount > 0) {
      const post = await this._single(
        `SELECT user_id FROM posts WHERE id = $1`,
        [postId],
      );

      await db.query(
        `UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1`,
        [postId],
      );

      if (post?.user_id !== userId) {
        await ActivityModel.create({
          actorId: userId,
          targetUserId: post.user_id,
          entityType: "post",
          entityId: postId,
          action: "like",
        });
      }

      await invalidate([`posts:feed:*`]);
    }

    return { liked: true };
  }

  /* ---------------- DISLIKE ---------------- */
  static async dislikePost(userId, postId) {
    const result = await db.query(
      `
    DELETE FROM post_likes
    WHERE post_id = $1 AND user_id = $2
    `,
      [postId, userId],
    );

    if (result.rowCount > 0) {
      const post = await this._single(
        `SELECT user_id FROM posts WHERE id = $1`,
        [postId],
      );
      await db.query(
        `
      UPDATE posts
      SET likes_count = GREATEST(likes_count - 1, 0)
      WHERE id = $1
      `,
        [postId],
      );

      if (post?.user_id !== userId) {
        await ActivityModel.create({
          actorId: userId,
          targetUserId: post.user_id,
          entityType: "post",
          entityId: postId,
          action: "dislike",
        });
      }

      await invalidate([`posts:feed:*`]);
    }

    return { liked: false };
  }

  /* ---------------- COMMENTS ---------------- */
  static async postComment(postId, userId, content, parentCommentId = null) {
    const comment = await this._single(
      `
    INSERT INTO post_comments (post_id, user_id, content, parent_comment_id)
    VALUES ($1,$2,$3,$4)
    RETURNING *
    `,
      [postId, userId, content, parentCommentId],
    );

    const post = await this._single(`SELECT user_id FROM posts WHERE id = $1`, [
      postId,
    ]);

    await db.query(
      `UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1`,
      [postId],
    );

    if (post?.user_id !== userId) {
      await ActivityModel.create({
        actorId: userId,
        targetUserId: post.user_id,
        entityType: "post",
        entityId: postId,
        action: "comment",
        metadata: { content },
      });
    }

    await invalidate([`posts:feed:*`]);

    return comment;
  }

  /* ---------------- COMMUNITY FEED ---------------- */
  static async getPostForUsers(userId, limit = 5, cursor = null) {
    const cacheKey = `posts:feed:${userId}:l${limit}:c${cursor || "first"}`;

    return getOrSetCache(cacheKey, 30, async () => {
      const posts = await this._many(
        `
        SELECT
          p.id,
          p.title,
          p.content,
          p.media_url,
          p.media_type,
          p.created_at,
          p.likes_count,
          p.comments_count,

          EXISTS (
            SELECT 1
            FROM post_likes pl
            WHERE pl.post_id = p.id
              AND pl.user_id = $1
          ) AS is_liked,

          u.id AS author_id,
          u.first_name,
          u.last_name,
          u.avatar_url

        FROM posts p
        JOIN users u ON u.id = p.user_id
        JOIN villages v_leader ON v_leader.village_id = u.village_id
        JOIN blocks b ON b.block_id = v_leader.block_id

        WHERE u.role = 'leader'
          AND (
            b.block_id = (
              SELECT v_user.block_id
              FROM users u_user
              JOIN villages v_user ON v_user.village_id = u_user.village_id
              WHERE u_user.id = $1
            )
            OR EXISTS (
              SELECT 1
              FROM follows f
              WHERE f.follower_id = $1
                AND f.following_id = u.id
            )
          )
          AND ($3::timestamp IS NULL OR p.created_at < $3)

        ORDER BY p.created_at DESC
        LIMIT $2
        `,
        [userId, limit, cursor],
      );

      return {
        posts,
        nextCursor: posts.length ? posts[posts.length - 1].created_at : null,
      };
    });
  }

  static async getPostComments(postId, limit = 10, cursor = null) {
    return this._many(
      `
    SELECT
      pc.id,
      pc.post_id,
      pc.content,
      pc.created_at,
      pc.parent_comment_id,
      u.id AS user_id,
      u.first_name,
      u.last_name,
      u.avatar_url
    FROM post_comments pc
    JOIN users u ON u.id = pc.user_id
    WHERE pc.post_id = $1
      AND ($3::timestamp IS NULL OR pc.created_at > $3)
    ORDER BY pc.created_at ASC
    LIMIT $2
    `,
      [postId, limit, cursor],
    );
  }

  static async getUserPosts(userId, limit = 10, cursor = null) {
    const posts = await this._many(
      `
    SELECT
      p.id,
      p.title,
      p.content,
      p.media_url,
      p.media_type,
      p.villages,
      p.created_at,
      p.likes_count,
      p.comments_count,
      
      EXISTS (
        SELECT 1
        FROM post_likes pl
        WHERE pl.post_id = p.id
          AND pl.user_id = $1
      ) AS is_liked,
      
      u.id AS author_id,
      u.first_name,
      u.last_name,
      u.avatar_url
      
    FROM posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id = $1
      AND ($3::timestamp IS NULL OR p.created_at < $3)
    ORDER BY p.created_at DESC
    LIMIT $2
    `,
      [userId, limit, cursor],
    );

    return {
      posts,
      nextCursor: posts.length ? posts[posts.length - 1].created_at : null,
    };
  }
}

export default PostModel;
