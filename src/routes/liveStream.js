import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";

import {
  getUserStreams,
  setupStream,
  startStream,
  stopStream,
  restartStream,
  updateOverlays,
  getStreamsForUser,
} from "../controllers/stream/stream.controller.js";

const router = Router();

router.get("/user", authMiddleware, getStreamsForUser);

// Dynamic routes (variables) must come LAST
router.get("/:userId", authMiddleware, getUserStreams);

// POST routes are safe because they use a different HTTP method
router.post("/setup", authMiddleware, setupStream);
router.post("/start", authMiddleware, startStream);
router.post("/stop", authMiddleware, stopStream);
router.post("/restart", authMiddleware, restartStream);
router.post("/overlays/update", authMiddleware, updateOverlays);

export default router;
