// src/services/stream-setup.service.js
import { createSessionId } from "./webrtc.service.js";
import { getTokenRecord, ensureAccessToken } from "./tokenMangaer.js";
import * as YouTubeService from "./social/youtube.service.js";
import * as FacebookService from "./social/facebook.service.js";
import StreamModel from "../models/streams.models.js";
import { ApiError } from "../utils/ApiError.js";

const activeSessions = new Map();

export async function setup(payload) {
  const {
    userId,
    title,
    description,
    scheduledStartTime,
    youtube,
    facebook,
    instagram,
    overlays,
  } = payload;

  const sessionId = createSessionId();
  const shareUrls = {};
  let youtubeKey = null;
  let facebookKey = null;
  let instagramKey = null;
  let youtubeBroadcastId = null; // ✅ Store broadcast ID separately

  // --- YOUTUBE SETUP ---
  if (youtube) {
    const record = await getTokenRecord({ userId, provider: "youtube" });

    if (!record) {
      throw new ApiError(
        400,
        "YouTube account is not connected. Please go to settings and link your account.",
      );
    }

    try {
      const { access_token } = await ensureAccessToken(record);
      const youTubeData = await YouTubeService.createYouTubeStream(
        access_token,
        title,
        description,
        scheduledStartTime,
      );

      const { broadcast, stream, ingestUrl } = youTubeData;

      // Validation
      if (!ingestUrl || !stream?.cdn?.ingestionInfo?.streamName) {
        throw new Error("Invalid response from YouTube API");
      }

      youtubeKey = ingestUrl;
      youtubeBroadcastId = broadcast.id; // ✅ Store the broadcast ID

      console.log("YouTube Broadcast Created:");
      console.log("- Broadcast ID:", youtubeBroadcastId);
      console.log("- Ingest URL:", youtubeKey);

      // Store the watch URL with broadcast ID
      shareUrls.youtube = `https://www.youtube.com/watch?v=${broadcast.id}`;
    } catch (error) {
      console.error("YouTube Setup Error:", error);
      throw new ApiError(502, `YouTube Setup Failed: ${error.message}`);
    }
  }

  // --- FACEBOOK SETUP ---
  if (facebook) {
    const record = await getTokenRecord({ userId, provider: "facebook" });

    if (!record) {
      throw new ApiError(
        400,
        "Facebook account is not connected. Please link your account.",
      );
    }

    try {
      const { access_token } = await ensureAccessToken(record);
      const fb = await FacebookService.createFacebookStream(access_token);

      if (!fb || !fb.rtmp) {
        throw new Error("Invalid response from Facebook API");
      }

      facebookKey = fb.rtmp;
      shareUrls.facebook = fb.watchUrl;

      // Extract Facebook video ID if available
      const videoIdMatch = fb.watchUrl?.match(/videos\/(\d+)/);
      if (videoIdMatch) {
        console.log("Facebook Video ID:", videoIdMatch[1]);
      }
    } catch (error) {
      console.error("Facebook Setup Error:", error);
      throw new ApiError(502, `Facebook Setup Failed: ${error.message}`);
    }
  }

  // --- INSTAGRAM SETUP ---
  if (instagram) {
    // Placeholder - implement when ready
    throw new ApiError(501, "Instagram streaming is coming soon!");
  }

  // --- DATABASE SAVE ---
  try {
    await StreamModel.add({
      id: sessionId,
      userId,
      title,
      description,
      thumbnailUrl: overlays?.logoUrl || null,
      scheduledStartTime,
      youtubeKey: youtubeKey, // RTMP ingest URL
      facebookKey,
      instagramKey,
      overlays,
      shareUrls, // Contains YouTube watch URL with broadcast ID
      token: null,
    });
  } catch (error) {
    console.error("Database Error:", error);
    throw new ApiError(500, "Failed to save stream session to database");
  }

  // Store in active sessions
  activeSessions.set(sessionId, {
    userId,
    youtubeKey,
    youtubeBroadcastId, // ✅ Store for later use
    facebookKey,
    instagramKey,
    overlays,
  });

  return {
    sessionId,
    shareUrls,
    youtubeBroadcastId, // Return to frontend if needed
  };
}
