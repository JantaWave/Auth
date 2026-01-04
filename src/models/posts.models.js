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

    // Invalidate relevant caches
    await invalidate([`posts:feed:*`, `posts:user:${userId}:*`]);

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

  /* ---------------- LIKE POST ---------------- */
  static async likePost(userId, postId) {
    // Use a transaction to ensure data consistency
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Insert like with conflict handling
      const likeResult = await client.query(
        `
        INSERT INTO post_likes (post_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (post_id, user_id) DO NOTHING
        RETURNING *
        `,
        [postId, userId],
      );

      // Only proceed if like was actually inserted
      if (likeResult.rowCount > 0) {
        // Get post details and increment count in single query
        const post = await client.query(
          `
          UPDATE posts 
          SET likes_count = likes_count + 1 
          WHERE id = $1
          RETURNING id, user_id
          `,
          [postId],
        );

        await client.query("COMMIT");

        // Create activity notification if not self-like
        if (post.rows[0]?.user_id && post.rows[0].user_id !== userId) {
          await ActivityModel.create({
            actorId: userId,
            targetUserId: post.rows[0].user_id,
            entityType: "post",
            entityId: postId,
            action: "like",
          });
        }

        // Invalidate caches
        await invalidate([
          `posts:feed:*`,
          `posts:user:${post.rows[0].user_id}:*`,
        ]);

        return { liked: true, success: true };
      }

      await client.query("COMMIT");
      return { liked: true, success: false, message: "Already liked" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /* ---------------- DISLIKE POST ---------------- */
  static async dislikePost(userId, postId) {
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Delete like
      const deleteResult = await client.query(
        `
        DELETE FROM post_likes
        WHERE post_id = $1 AND user_id = $2
        RETURNING *
        `,
        [postId, userId],
      );

      // Only proceed if like was actually deleted
      if (deleteResult.rowCount > 0) {
        // Get post details and decrement count in single query
        const post = await client.query(
          `
          UPDATE posts
          SET likes_count = GREATEST(likes_count - 1, 0)
          WHERE id = $1
          RETURNING id, user_id
          `,
          [postId],
        );

        await client.query("COMMIT");

        // Create activity notification if not self-dislike
        if (post.rows[0]?.user_id && post.rows[0].user_id !== userId) {
          await ActivityModel.create({
            actorId: userId,
            targetUserId: post.rows[0].user_id,
            entityType: "post",
            entityId: postId,
            action: "dislike",
          });
        }

        // Invalidate caches
        await invalidate([
          `posts:feed:*`,
          `posts:user:${post.rows[0].user_id}:*`,
        ]);

        return { liked: false, success: true };
      }

      await client.query("COMMIT");
      return { liked: false, success: false, message: "Not liked" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /* ---------------- POST COMMENT ---------------- */
  static async postComment(postId, userId, content, parentCommentId = null) {
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Insert comment
      const comment = await client.query(
        `
        INSERT INTO post_comments (post_id, user_id, content, parent_comment_id)
        VALUES ($1,$2,$3,$4)
        RETURNING *
        `,
        [postId, userId, content, parentCommentId],
      );

      // Update comment count and get post owner
      const post = await client.query(
        `
        UPDATE posts 
        SET comments_count = comments_count + 1 
        WHERE id = $1
        RETURNING id, user_id
        `,
        [postId],
      );

      await client.query("COMMIT");

      // Create activity notification if not self-comment
      if (post.rows[0]?.user_id && post.rows[0].user_id !== userId) {
        await ActivityModel.create({
          actorId: userId,
          targetUserId: post.rows[0].user_id,
          entityType: "post",
          entityId: postId,
          action: "comment",
          metadata: { content: content.substring(0, 100) }, // Limit content length
        });
      }

      // If replying to a comment, notify the parent comment author
      if (parentCommentId) {
        const parentComment = await this._single(
          `SELECT user_id FROM post_comments WHERE id = $1`,
          [parentCommentId],
        );

        if (parentComment?.user_id && parentComment.user_id !== userId) {
          await ActivityModel.create({
            actorId: userId,
            targetUserId: parentComment.user_id,
            entityType: "comment",
            entityId: parentCommentId,
            action: "reply",
            metadata: { content: content.substring(0, 100) },
          });
        }
      }

      // Invalidate caches
      await invalidate([
        `posts:feed:*`,
        `posts:user:${post.rows[0].user_id}:*`,
        `posts:comments:${postId}:*`,
      ]);

      return comment.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /* ---------------- DELETE COMMENT ---------------- */
  static async deleteComment(commentId, userId) {
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Verify ownership and get comment details
      const comment = await client.query(
        `
        SELECT id, post_id, user_id 
        FROM post_comments 
        WHERE id = $1 AND user_id = $2
        `,
        [commentId, userId],
      );

      if (comment.rowCount === 0) {
        await client.query("ROLLBACK");
        return { success: false, message: "Comment not found or unauthorized" };
      }

      const postId = comment.rows[0].post_id;

      // Delete comment
      await client.query(`DELETE FROM post_comments WHERE id = $1`, [
        commentId,
      ]);

      // Decrement comment count
      await client.query(
        `
        UPDATE posts 
        SET comments_count = GREATEST(comments_count - 1, 0)
        WHERE id = $1
        `,
        [postId],
      );

      await client.query("COMMIT");

      // Invalidate caches
      await invalidate([`posts:feed:*`, `posts:comments:${postId}:*`]);

      return { success: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
          u.avatar_url,
          u.role

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

  /* ---------------- GET POST COMMENTS ---------------- */
  static async getPostComments(postId, limit = 10, cursor = null) {
    const cacheKey = `posts:comments:${postId}:l${limit}:c${cursor || "first"}`;

    return getOrSetCache(cacheKey, 60, async () => {
      const comments = await this._many(
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
          u.avatar_url,
          u.role
        FROM post_comments pc
        JOIN users u ON u.id = pc.user_id
        WHERE pc.post_id = $1
          AND ($3::timestamp IS NULL OR pc.created_at > $3)
        ORDER BY pc.created_at ASC
        LIMIT $2
        `,
        [postId, limit, cursor],
      );

      return {
        comments,
        nextCursor: comments.length
          ? comments[comments.length - 1].created_at
          : null,
      };
    });
  }

  /* ---------------- GET USER POSTS ---------------- */
  static async getUserPosts(userId, limit = 10, cursor = null) {
    const cacheKey = `posts:user:${userId}:l${limit}:c${cursor || "first"}`;

    return getOrSetCache(cacheKey, 60, async () => {
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
          u.avatar_url,
          u.role
          
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
    });
  }

  /* ---------------- GET SINGLE POST ---------------- */
  static async getPostById(postId, userId = null) {
    const post = await this._single(
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
        
        ${
          userId
            ? `
        EXISTS (
          SELECT 1
          FROM post_likes pl
          WHERE pl.post_id = p.id
            AND pl.user_id = $2
        ) AS is_liked,
        `
            : "false AS is_liked,"
        }
        
        u.id AS author_id,
        u.first_name,
        u.last_name,
        u.avatar_url,
        u.role
        
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = $1
      `,
      userId ? [postId, userId] : [postId],
    );

    return post;
  }

  /* ---------------- DELETE POST ---------------- */
  static async deletePost(postId, userId) {
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Verify ownership
      const post = await client.query(
        `SELECT id, user_id FROM posts WHERE id = $1 AND user_id = $2`,
        [postId, userId],
      );

      if (post.rowCount === 0) {
        await client.query("ROLLBACK");
        return { success: false, message: "Post not found or unauthorized" };
      }

      // Delete associated data (comments, likes) - cascade should handle this
      // but explicit deletion ensures cleanup
      await client.query(`DELETE FROM posts WHERE id = $1`, [postId]);

      await client.query("COMMIT");

      // Invalidate caches
      await invalidate([
        `posts:feed:*`,
        `posts:user:${userId}:*`,
        `posts:comments:${postId}:*`,
      ]);

      return { success: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export default PostModel;
