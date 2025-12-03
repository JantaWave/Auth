import { Router } from "express";
import { db } from "../config/db.js";
import { v4 as uuidv4 } from "uuid";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  createPost,
  getUserPost,
  likeOrDislikePost,
} from "../controllers/post/posts.controller.js";

const router = Router();

/**
 * POST /api/v1/posts/create
 * Body: { userId, title, content, mediaUrl, mediaType, scheduledAt, villages, notifyWhatsapp }
 */
router.post("/create", createPost);

/**
 * GET /api/v1/posts/user/:userId
 * Fetch all posts for a user
 */
router.get("/user/:userId", getUserPost);

router.post("/:postId/:userId/like", likeOrDislikePost);

router.post(
  "/:postId/comment",
  asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const { content, parentCommentId } = req.body;
    const userId = req.user.id;

    const result = await db.query(
      `INSERT INTO post_comments (post_id, user_id, content, parent_comment_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [postId, userId, content, parentCommentId || null],
    );

    res.json(result.rows[0]);
  }),
);

router.get(
  "/:postId/comments",
  asyncHandler(async (req, res) => {
    const { postId } = req.params;

    const comments = await db.query(
      `SELECT pc.*, u.first_name, u.last_name, u.avatar_url
       FROM post_comments pc
       JOIN users u ON pc.user_id = u.id
       WHERE pc.post_id = $1
       ORDER BY pc.created_at ASC`,
      [postId],
    );

    res.json(comments.rows);
  }),
);

export default router;
