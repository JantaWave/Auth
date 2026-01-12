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

    // FIXED: Only invalidate the specific user's posts, not everyone's feed.
    // New posts will appear in others' feeds when their specific cache TTL expires.
    await invalidate([`posts:user:${userId}:*`]);

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
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const likeResult = await client.query(
        `
        INSERT INTO post_likes (post_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (post_id, user_id) DO NOTHING
        RETURNING *
        `,
        [postId, userId],
      );

      let newCount = null;

      if (likeResult.rowCount > 0) {
        // FIXED: Return the new likes_count so frontend can update immediately
        const post = await client.query(
          `
          UPDATE posts 
          SET likes_count = likes_count + 1 
          WHERE id = $1
          RETURNING id, user_id, likes_count
          `,
          [postId],
        );

        newCount = post.rows[0].likes_count;

        await client.query("COMMIT");

        if (post.rows[0]?.user_id && post.rows[0].user_id !== userId) {
          // We don't await this so we don't block the response time
          ActivityModel.create({
            actorId: userId,
            targetUserId: post.rows[0].user_id,
            entityType: "post",
            entityId: postId,
            action: "like",
          }).catch((err) => console.error("Activity creation failed", err));
        }

        // FIXED: Removed global feed invalidation.
        // Only invalidate the author's profile post list if strictly necessary.
        await invalidate([`posts:user:${post.rows[0].user_id}:*`]);
      } else {
        await client.query("COMMIT");
        // Retrieve current count if like already existed
        const current = await this._single(
          `SELECT likes_count FROM posts WHERE id = $1`,
          [postId],
        );
        newCount = current?.likes_count;
      }

      return { liked: true, likes_count: newCount };
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

      const deleteResult = await client.query(
        `
        DELETE FROM post_likes
        WHERE post_id = $1 AND user_id = $2
        RETURNING *
        `,
        [postId, userId],
      );

      let newCount = null;

      if (deleteResult.rowCount > 0) {
        // FIXED: Return new count
        const post = await client.query(
          `
          UPDATE posts
          SET likes_count = GREATEST(likes_count - 1, 0)
          WHERE id = $1
          RETURNING id, user_id, likes_count
          `,
          [postId],
        );

        newCount = post.rows[0].likes_count;

        await client.query("COMMIT");

        // FIXED: Removed global feed invalidation
        await invalidate([`posts:user:${post.rows[0].user_id}:*`]);
      } else {
        await client.query("COMMIT");
        const current = await this._single(
          `SELECT likes_count FROM posts WHERE id = $1`,
          [postId],
        );
        newCount = current?.likes_count;
      }

      return { liked: false, likes_count: newCount };
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

      const commentResult = await client.query(
        `
        INSERT INTO post_comments (post_id, user_id, content, parent_comment_id)
        VALUES ($1,$2,$3,$4)
        RETURNING *
        `,
        [postId, userId, content, parentCommentId],
      );

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

      // Handle Notifications asynchronously
      const handleNotifications = async () => {
        try {
          if (post.rows[0]?.user_id && post.rows[0].user_id !== userId) {
            await ActivityModel.create({
              actorId: userId,
              targetUserId: post.rows[0].user_id,
              entityType: "post",
              entityId: postId,
              action: "comment",
              metadata: { content: content.substring(0, 100) },
            });
          }

          if (parentCommentId) {
            const parentComment = await db.query(
              `SELECT user_id FROM post_comments WHERE id = $1`,
              [parentCommentId],
            );

            if (
              parentComment.rows[0]?.user_id &&
              parentComment.rows[0].user_id !== userId
            ) {
              await ActivityModel.create({
                actorId: userId,
                targetUserId: parentComment.rows[0].user_id,
                entityType: "comment",
                entityId: parentCommentId,
                action: "reply",
                metadata: { content: content.substring(0, 100) },
              });
            }
          }
        } catch (e) {
          console.error("Notification error", e);
        }
      };

      handleNotifications();

      // FIXED: Only invalidate the specific comment cache for this post
      await invalidate([
        `posts:comments:${postId}:*`,
        // Optional: invalidate user profile if you show comment counts there
        `posts:user:${post.rows[0].user_id}:*`,
      ]);

      return commentResult.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /* ---------------- COMMUNITY FEED ---------------- */
  static async getPostForUsers(userId, limit = 5, cursor = null) {
    // FIXED: Validation to prevent SQL crash
    const validCursor = cursor && !isNaN(Date.parse(cursor)) ? cursor : null;

    const cacheKey = `posts:feed:${userId}:l${limit}:c${validCursor || "first"}`;

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
        [userId, limit, validCursor],
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
      return await this._many(
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
    });
  }
}

export default PostModel;
