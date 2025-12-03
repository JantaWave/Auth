import { Router } from "express";
import axios from "axios";
import {
  createStream,
  getUserStreams,
  restartStream,
  setStream,
  startStream,
  stopStream,
  updateOverlays,
} from "../controllers/stream/stream.controller.js";

const router = Router();

const activeSessions = new Map();

router.get("/", getUserStreams);

/**
 * POST /api/v1/streams/setup
 * body: { userId, title, description, scheduledStartTime, youtube, facebook, instagram, overlays }
 */
router.post("/setup", setStream);

async function getYouTubeStreamUrl(accessToken) {
  try {
    // 1. List the user's broadcasts/streams to find the active one
    // We filter by 'mine=true' to get the authenticated user's streams
    const { data } = await axios.get(
      "https://www.googleapis.com/youtube/v3/liveStreams?part=cdn&mine=true",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!data.items || data.items.length === 0) {
      throw new Error("No live streams found on YouTube channel.");
    }

    // 2. Pick the first valid stream (or you could filter by title/date)
    const stream = data.items[0];
    const ingestion = stream.cdn?.ingestionInfo;

    if (!ingestion) {
      throw new Error("No ingestion info found for YouTube stream.");
    }

    // 3. Construct the RTMP URL
    return `${ingestion.ingestionAddress}/${ingestion.streamName}`;
  } catch (error) {
    console.error("YouTube API Error:", error.response?.data || error.message);
    return null;
  }
}

/**
 * HELPER: Create Facebook Live Video to get RTMP URL
 */

/**
 * POST /api/v1/streams/start
 */
router.post("/start", startStream);

/**
 * POST /api/v1/streams/stop
 * body: { sessionId }
 */

router.post("/stop", stopStream);

/**
 * POST /api/v1/streams/overlays/update
 * body: { sessionId, overlays }
 */
router.post("/overlays/update", updateOverlays);

/**
 * POST /api/v1/streams/create-live
 * body: { userId, title, description, scheduledStartTime }
 */
router.post("/create-live", createStream);

/**
 * POST /api/v1/streams/restart
 * Use this when switching inputs (e.g. adding/removing screen share)
 */
router.post("/restart", restartStream);

export default router;
