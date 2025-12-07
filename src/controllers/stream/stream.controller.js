import {
  initMediasoup,
  createRtpOutputForSession,
  createSessionId,
  stopSession,
} from "../../services/webrtc.service.js";
import { startPolling, stopPolling } from "../../services/social.service.js";
import { ffmpegService } from "../../services/ffmpeg.service.js";
import { overlayService } from "../../services/overlay.service.js";
import { io } from "../../socket.js";
import {
  ensureAccessToken,
  getTokenRecord,
} from "../../services/tokenMangaer.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import StreamModel from "../../models/streams.models.js";

async function createFacebookStreamUrl(accessToken) {
  try {
    // Create a live video object on the user's timeline (or page)
    const { data } = await axios.post(
      `https://graph.facebook.com/me/live_videos`,
      {
        status: "LIVE_NOW", // or "UNPUBLISHED" if you want to preview first
        description: "Live Stream via JantaWave",
      },
      {
        params: { access_token: accessToken },
      },
    );

    // Facebook returns 'stream_url' (RTMP) and 'secure_stream_url' (RTMPS)
    return {
      rtmp: data.secure_stream_url || data.stream_url,
      id: data.id, // ✅ Return Video ID
    };
  } catch (error) {
    console.error("Facebook API Error:", error.response?.data || error.message);
    return null;
  }
}

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
          // privacyStatus: "public",
          privacyStatus: "unlisted",
        },
        contentDetails: {
          enableAutoStart: true,
          enableAutoStop: false,
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

export const getUserStreams = asyncHandler(async (req, res) => {
  console.log("user from stream", req.user);
  const userId = req.user?.id;
  if (!userId) throw new ApiError(401, "UserId is Required.");

  const result = await StreamModel.getAllUserStreams(userId);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "streams fetched successfully."));
});

export const setStream = asyncHandler(async (req, res) => {
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

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const sessionId = createSessionId();
  const shareUrls = {};

  let youtubeKey = null;
  let facebookKey = null;
  let instagramKey = null;
  let youtubeStreamKey = null;

  // --- 1. YOUTUBE: Fetch Active Stream Key ---
  if (youtube === "true" || youtube === true) {
    const record = await getTokenRecord({ userId, provider: "youtube" });
    if (record) {
      try {
        const { access_token } = await ensureAccessToken(record);

        console.log("Creating YouTube Broadcast...");
        const startTime =
          scheduledStartTime || new Date(Date.now() + 60 * 1000).toISOString();

        // 1. Create Broadcast
        const broadcast = await createLiveBroadcast(access_token, {
          title: title || "Live Stream",
          description: description || "",
          scheduledStartTime: startTime,
        });
        if (broadcast.id) {
          shareUrls.youtube = `https://www.youtube.com/watch?v=${broadcast.id}`;
        }

        const stream = await createLiveStream(access_token, {
          title: (title || "Live") + " Stream",
          description: description || "",
        });

        // 3. Bind them together
        await bindStreamToBroadcast(access_token, {
          broadcastId: broadcast.id,
          streamId: stream.id,
        });

        if (stream.cdn?.ingestionInfo) {
          console.log("stream Info:", stream.cdn);
          const { ingestionAddress, streamName } = stream.cdn.ingestionInfo;
          youtubeStreamKey = streamName;
          youtubeKey = `${ingestionAddress}/${streamName}`;
          console.log("Generated YouTube RTMP:", youtubeKey);
        } else {
          throw new Error("No ingestion info returned from YouTube");
        }
      } catch (err) {
        // ✅ NEW CODE: Throw error so Frontend sees it
        const errMsg = err.response?.data?.error?.message || err.message;
        console.error(
          "YouTube Setup Failed:",
          JSON.stringify(err.response?.data || err.message, null, 2),
        );
        return res.status(500).json({ error: `YouTube Error: ${errMsg}` });
      }
    } else {
      return res
        .status(400)
        .json({ error: "User has not connected a YouTube account." });
    }
  }

  // --- 2. FACEBOOK: Generate New Stream Key ---
  if (facebook === "true" || facebook === true) {
    const record = await getTokenRecord({ userId, provider: "facebook" });
    if (record) {
      try {
        const { access_token } = await ensureAccessToken(record);
        // Create a new Live Video instance on FB to get the RTMP URL
        facebookKey = await createFacebookStreamUrl(access_token);
        if (facebookKey.id) {
          shareUrls.facebook = `https://www.facebook.com/${facebookKey.id}`;
        }
        console.log("Generated Facebook RTMP:", facebookKey.rtmp);
      } catch (err) {
        console.error("Failed to get Facebook stream key:", err.message);
      }
    }
  }

  // --- 3. INSTAGRAM: (Placeholder - requires complex graph API) ---
  if (instagram === "true" || instagram === true) {
    const record = await getTokenRecord({ userId, provider: "instagram" });
    if (record) {
      // Instagram Live API is restricted; usually requires third-party provider logic.
      // For now, we can leave this or implement similar to FB if you have access.
      console.warn("Instagram auto-generation not fully implemented.");
    }
  }

  // Fallback to prevent FFmpeg crash if no keys found
  if (!youtubeKey && !facebookKey && !instagramKey) {
    console.warn("No valid RTMP keys generated. Using local test sink.");
    youtubeKey = "rtmp://127.0.0.1/live/default_test";
  }

  console.log("type instagramKey:", typeof instagramKey);
  console.log("type youtubeKey:", typeof youtubeKey);
  console.log("type facebookKey:", typeof facebookKey);

  const thumbnailUrl = overlays?.logoUrl || null;

  try {
    await StreamModel.addStreams(
      sessionId,
      userId,
      title,
      description,
      thumbnailUrl, // Mapped to your new column
      scheduledStartTime,
      youtubeStreamKey,
      facebookKey,
      instagramKey,
      overlays,
      shareUrls,
    );
  } catch (err) {
    console.log(err);
  }

  // Cache in memory
  activeSessions.set(sessionId, {
    userId,
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
        { sessionId, shareUrls },
        "Session created successfully",
      ),
    );
});

export const startStream = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  // 1. Try Memory
  let cfg = activeSessions.get(sessionId);

  // 2. Try DB
  if (!cfg) {
    console.log("using DB for cfg");
    try {
      const result = await StreamModel.getStreams(sessionId);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log("DATA from DB", row);
        cfg = {
          userId: row.user_id,
          youtubeKey: row?.youtube_key,
          facebookKey: row?.facebook_key,
          instagramKey: row?.instagram_key,
          overlays: row?.overlays,
        };
        activeSessions.set(sessionId, cfg);
      }
    } catch (err) {
      console.log(err);
    }
  }

  console.log("type instagramKey:", cfg.instagramKey);
  console.log("type youtubeKey:", cfg.youtubeKey);
  console.log("type facebookKey:", cfg.facebookKey);

  if (!cfg) {
    return res.status(404).json({ error: "Session not found" });
  }

  // Update DB status
  db.query(
    `UPDATE streams SET status = 'live', updated_at = NOW() WHERE id = $1`,
    [sessionId],
  ).catch(console.error);

  await initMediasoup(req.app.get("io") || req.io);

  const basePort = 10000 + Math.floor(Math.random() * 5000) * 2;
  const {
    audioPort,
    videoPort,
    screenPort,
    audioPayloadType,
    videoPayloadType,
    screenPayloadType,
    hasScreen,
  } = await createRtpOutputForSession(sessionId, basePort);

  const ff = ffmpegService.start(
    sessionId,
    audioPort,
    videoPort,
    screenPort, // screenPort not used in /start, pass null
    cfg?.youtubeKey || "",
    cfg?.facebookKey || "",
    cfg?.instagramKey || "",
    videoPayloadType,
    audioPayloadType,
    screenPayloadType,
    hasScreen,
  );

  activeSessions.set(sessionId, { ...cfg, ff, audioPort, videoPort });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        sessionId,
        audioPort,
        videoPort,
        audioPayloadType,
        videoPayloadType,
        ff,
        rtmpUrl: cfg.youtubeKey || cfg.facebookKey,
      },
      "Stream Started Successfully",
    ),
  );
});

export const stopStream = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;

  stopPolling(sessionId);
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  try {
    ffmpegService.stop(sessionId);
  } catch (e) {}
  await stopSession(sessionId).catch((e) => {});

  activeSessions.delete(sessionId);

  // Update DB status
  db.query(
    `UPDATE streams SET status = 'ended', updated_at = NOW() WHERE id = $1`,
    [sessionId],
  ).catch(console.error);

  return res
    .status(200)
    .json(
      new ApiResponse(200, { stopped: true }, "Stream stopped successfully."),
    );
});

export const updateOverlays = asyncHandler(async (req, res) => {
  const { sessionId, overlays } = req.body;

  if (!sessionId || !overlays)
    throw new ApiError(400, "sessionId and overlays required");

  overlayService.update(overlays);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        updated: true,
      },
      "Updated overlays.json. Restart ffmpeg to apply changes.",
    ),
  );
});

export const createStream = asyncHandler(async (req, res) => {
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
  if (broadcast?.id) {
    startPolling(sessionId, userId, broadcast.id, null);
  }

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

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        success: true,
        broadcast,
        stream,
        binding,
        ingestion,
      },
      "Stream Created successfully.",
    ),
  );
});

export const restartStream = asyncHandler(async (req, res) => {
  const { sessionId, isCameraOn } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId required" });
  }

  // 1. Retrieve active configuration
  let cfg = activeSessions.get(sessionId);

  // If not in memory, try DB (handling server restarts)
  if (!cfg) {
    try {
      const result = await StreamModel.getStreams(sessionId);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        cfg = {
          userId: row.user_id,
          youtubeKey: row.youtube_key,
          facebookKey: row.facebook_key,
          instagramKey: row.instagram_key,
          overlays: row.overlays,
        };
        activeSessions.set(sessionId, cfg);
      }
    } catch (err) {
      console.log(err);
    }
  }

  if (!cfg) {
    return res.status(404).json({ error: "Session not found" });
  }

  const cameraActive =
    isCameraOn !== undefined ? isCameraOn : cfg.isCameraOn !== false;

  console.log(`Restarting session ${sessionId}...`);

  // 2. Stop the running FFmpeg process (but keep Mediasoup alive)
  try {
    ffmpegService.stop(sessionId);
  } catch (e) {
    console.warn("FFmpeg stop warning:", e.message);
  }

  // 3. Re-create RTP Outputs
  // This checks Mediasoup for ALL active producers (Audio, Video, Screen)
  // and creates new UDP ports for them.
  const basePort = 10000 + Math.floor(Math.random() * 5000) * 2;

  const {
    audioPort,
    videoPort,
    screenPort,
    audioPayloadType,
    videoPayloadType,
    screenPayloadType,
    hasScreen,
  } = await createRtpOutputForSession(sessionId, basePort);

  console.log(`Restarted topology: Screen Active? ${hasScreen}`);

  // 4. Start FFmpeg with the new topology
  // Note: We match the signature expected by ffmpeg.service.js
  const ff = ffmpegService.start(
    sessionId,
    audioPort,
    videoPort,
    screenPort, // ✅ Pass Screen Port
    cfg.youtubeKey,
    cfg.facebookKey,
    cfg.instagramKey,
    videoPayloadType,
    audioPayloadType,
    screenPayloadType, // ✅ Pass Screen Payload
    hasScreen, // ✅ Pass Flag
    cameraActive,
  );

  // 5. Update Session State
  activeSessions.set(sessionId, {
    ...cfg,
    ff,
    audioPort,
    videoPort,
    screenPort,
    hasScreen,
    isCameraOn: cameraActive,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        restarted: true,
        hasScreen,
        isCameraOn: cameraActive,
      },
      "Stream restarted successfully.",
    ),
  );
});
