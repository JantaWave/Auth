import { Router } from "express";
import {
  initMediasoup,
  createRtpOutputForSession,
  createSessionId,
  stopSession,
} from "../services/webrtc.service.js";
import { ffmpegService } from "../services/ffmpeg.service.js";
import { overlayService } from "../services/overlay.service.js";
import { io } from "../socket.js";
import { ensureAccessToken, getTokenRecord } from "../services/tokenMangaer.js";
import axios from "axios";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const router = Router();
const state = new Map();

/**
 * POST /api/v1/streams/setup
 * body: { userId, title, description, scheduledStartTime, youtube, facebook, instagram, overlays }
 */
router.post(
  "/setup",
  asyncHandler(async (req, res) => {
    const {
      userId,
      title,
      description,
      scheduledStartTime,
      youtube,
      facebook,
      instagram,
      overlays,
    } = req.body;

    console.log("Body", req.body);

    // Validate required fields
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const sessionId = createSessionId();

    // Initialize keys as null
    let youtubeKey = null;
    let facebookKey = null;
    let instagramKey = null;

    // Fetch keys with await
    if (youtube === "true" || youtube === true) {
      youtubeKey = await getTokenRecord({ userId, provider: "youtube" });
    }
    if (facebook === "true" || facebook === true) {
      facebookKey = await getTokenRecord({ userId, provider: "facebook" });
    }
    if (instagram === "true" || instagram === true) {
      instagramKey = await getTokenRecord({ userId, provider: "instagram" });
    }

    state.set(sessionId, {
      userId,
      title,
      description,
      scheduledStartTime,
      youtubeKey,
      facebookKey,
      instagramKey,
      overlays,
    });

    if (overlays) overlayService.update(overlays);
    console.log("Session Id:", sessionId);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { sessionId: sessionId },
          "Session created successfully",
        ),
      );
  }),
);

/**
 * POST /api/v1/streams/start
 * body: { sessionId }
 */
router.post(
  "/start",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    const cfg = state.get(sessionId);
    if (!cfg) {
      return res.status(404).json({ error: "session not found" });
    }

    // Ensure mediasoup is initialized
    await initMediasoup(req.app.get("io") || req.io);

    // Create RTP outputs for session
    const basePort = parseInt(process.env.RTP_BASE_PORT || "5004", 10);
    const ports = await createRtpOutputForSession(sessionId, basePort);

    // Start ffmpeg
    const ff = ffmpegService.start(
      sessionId,
      ports.audioPort,
      ports.videoPort,
      cfg.youtubeKey,
      cfg.facebookKey,
      cfg.instagramKey,
    );

    // **NEW: Generate the RTMP URL to return to client**
    let rtmpUrl = null;
    let streamKey = null;

    // Return the first available RTMP target
    if (cfg.youtubeKey) {
      if (cfg.youtubeKey.startsWith("rtmp")) {
        rtmpUrl = cfg.youtubeKey;
      } else {
        rtmpUrl = "rtmp://a.rtmp.youtube.com/live2";
        streamKey = cfg.youtubeKey;
      }
    } else if (cfg.facebookKey) {
      if (cfg.facebookKey.startsWith("rtmp")) {
        rtmpUrl = cfg.facebookKey;
      } else {
        rtmpUrl = "rtmps://live-api-s.facebook.com:443/rtmp";
        streamKey = cfg.facebookKey;
      }
    } else if (cfg.instagramKey) {
      if (cfg.instagramKey.startsWith("rtmp")) {
        rtmpUrl = cfg.instagramKey;
      } else {
        rtmpUrl = "rtmps://live-upload.instagram.com:443/rtmp";
        streamKey = cfg.instagramKey;
      }
    }

    // Update state with ff metadata
    state.set(sessionId, { ...cfg, ff, ports });

    return res.json({
      sessionId,
      ports,
      ff,
      rtmpUrl,
      streamKey,
    });
  }),
);

/**
 * POST /api/v1/streams/stop
 * body: { sessionId }
 */
router.post(
  "/stop",
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    // Stop ffmpeg
    await ffmpegService.stop(sessionId).catch((err) => {
      console.warn("FFmpeg stop warning:", err.message);
    });

    // Stop mediasoup producers
    await stopSession(sessionId).catch((err) => {
      console.warn("Mediasoup stop warning:", err.message);
    });

    // Clear state
    state.delete(sessionId);

    return res.json({ stopped: true });
  }),
);

/**
 * POST /api/v1/streams/overlays/update
 * body: { sessionId, overlays }
 */
router.post(
  "/overlays/update",
  asyncHandler(async (req, res) => {
    const { sessionId, overlays } = req.body;

    if (!sessionId || !overlays) {
      return res.status(400).json({ error: "sessionId and overlays required" });
    }

    overlayService.update(overlays);

    res.json({
      ok: true,
      message: "Updated overlays.json. Restart ffmpeg to apply changes.",
    });
  }),
);

/**
 * POST /api/v1/streams/create-live
 * body: { userId, title, description, scheduledStartTime }
 */
router.post(
  "/create-live",
  asyncHandler(async (req, res) => {
    const { userId, title, description, scheduledStartTime } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // 1. Get token record
    const record = await getTokenRecord({ userId, provider: "youtube" });
    if (!record) {
      return res
        .status(400)
        .json({ error: "YouTube not connected for this user" });
    }

    // 2. Ensure fresh access_token
    const { access_token } = await ensureAccessToken(record);

    // 3. Create a broadcast
    const broadcast = await createLiveBroadcast(access_token, {
      title: title || "Live Stream",
      description: description || "",
      scheduledStartTime: scheduledStartTime || new Date().toISOString(),
    });

    // 4. Create a stream
    const stream = await createLiveStream(access_token, {
      title: (title || "My Stream") + " Stream",
      description: description || "",
    });

    // 5. Bind them
    const binding = await bindStreamToBroadcast(access_token, {
      broadcastId: broadcast.id,
      streamId: stream.id,
    });

    // 6. Extract RTMP ingest URL + key
    const ingestion = stream.cdn?.ingestionInfo || null;

    if (!ingestion) {
      console.warn("No ingestion info returned from YouTube");
    }

    return res.json({
      success: true,
      broadcast,
      stream,
      binding,
      ingestion,
    });
  }),
);

export async function createLiveBroadcast(
  accessToken,
  { title, description, scheduledStartTime },
) {
  try {
    const { data } = await axios.post(
      "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails",
      {
        snippet: {
          title,
          description,
          scheduledStartTime,
        },
        status: {
          privacyStatus: "public",
        },
        contentDetails: {
          enableAutoStart: true,
          enableAutoStop: true,
        },
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    return data;
  } catch (error) {
    console.error(
      "createLiveBroadcast error:",
      error.response?.data || error.message,
    );
    throw new Error(
      `Failed to create broadcast: ${error.response?.data?.error?.message || error.message}`,
    );
  }
}

export async function createLiveStream(accessToken, { title, description }) {
  try {
    const { data } = await axios.post(
      "https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,contentDetails,status",
      {
        snippet: {
          title,
          description,
        },
        cdn: {
          ingestionType: "rtmp",
          resolution: "variable",
          frameRate: "variable",
        },
        contentDetails: {
          isReusable: false,
        },
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    console.log("livestream data", data);
    return data;
  } catch (error) {
    console.error(
      "createLiveStream error:",
      error.response?.data || error.message,
    );
    throw new Error(
      `Failed to create stream: ${error.response?.data?.error?.message || error.message}`,
    );
  }
}

export async function bindStreamToBroadcast(
  accessToken,
  { broadcastId, streamId },
) {
  try {
    const { data } = await axios.post(
      `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?part=id,contentDetails&streamId=${streamId}&id=${broadcastId}`,
      {},
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    return data;
  } catch (error) {
    console.error(
      "bindStreamToBroadcast error:",
      error.response?.data || error.message,
    );
    throw new Error(
      `Failed to bind stream: ${error.response?.data?.error?.message || error.message}`,
    );
  }
}

export default router;
