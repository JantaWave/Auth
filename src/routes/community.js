import { Router } from "express";
import { db } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post(
  "/follow/:userId",
  asyncHandler(async (req, res) => {
    const { followerId, followingId } = req.body;

    try {
      await db.query(
        `INSERT INTO follows (follower_id, following_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
        [followerId, followingId],
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Error following user" });
    }
  }),
);

router.post(
  "/unfollow/:userId",
  asyncHandler(async (req, res) => {
    const { followerId, followingId } = req.body;

    try {
      await db.query(
        `DELETE FROM follows
       WHERE follower_id=$1 AND following_id=$2`,
        [followerId, followingId],
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Error unfollowing user" });
    }
  }),
);

router.get(
  "/:userId/followers",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const result = await db.query(
        `SELECT follower_id FROM follows WHERE following_id = $1`,
        [userId],
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ message: "Error unfollowing user" });
    }
  }),
);

router.get(
  "/:userId/following",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const result = await db.query(
        `SELECT following_id FROM follows WHERE follower_id = $1`,
        [userId],
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ message: "Error unfollowing user" });
    }
  }),
);

export default router;
