// src/routes/community.routes.js
import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";

import {
  followUser,
  unfollowUser,
  removeFollower,
  getUserFollowers,
  getUserFollowings,
} from "../controllers/community/social.js";

const router = Router();

/* ---------------- FOLLOW USER ---------------- */
// POST /api/v1/user/:id/follow
router.post("/:id/follow", authMiddleware, followUser);

/* ---------------- UNFOLLOW USER ---------------- */
// POST /api/v1/user/:id/unfollow
router.post("/:id/unfollow", authMiddleware, unfollowUser);

/* ---------------- REMOVE FOLLOWER ---------------- */
// POST /api/v1/user/:id/remove-follower
router.post("/:id/remove-follower", authMiddleware, removeFollower);

/* ---------------- GET FOLLOWERS ---------------- */
// GET /api/v1/user/followers
router.get("/followers", authMiddleware, getUserFollowers);

/* ---------------- GET FOLLOWINGS ---------------- */
// GET /api/v1/user/followings
router.get("/followings", authMiddleware, getUserFollowings);

export default router;
