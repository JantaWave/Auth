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

router.get("/", authMiddleware, getUserStreams);
router.post("/setup", authMiddleware, setupStream);
router.post("/start", authMiddleware, startStream);
router.post("/stop", authMiddleware, stopStream);
router.post("/restart", authMiddleware, restartStream);
router.post("/overlays/update", authMiddleware, updateOverlays);
router.get("/user", authMiddleware, getStreamsForUser);

export default router;
