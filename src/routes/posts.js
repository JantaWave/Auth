import { Router } from "express";
import {
  createPost,
  getPostComments,
  getPostsForUser,
  getUserPost,
  likeOrDislikePost,
  postComments,
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
router.get("/user", getPostsForUser);

router.post("/:postId/:userId/like", likeOrDislikePost);

router.post("/:postId/comment", postComments);

router.get("/:postId/comments", getPostComments);

export default router;
