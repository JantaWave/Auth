import { createSessionId } from "./webrtc.service.js";
import { getTokenRecord, ensureAccessToken } from "./tokenMangaer.js";
import * as YouTubeService from "./social/youtube.service.js";
import * as FacebookService from "./social/facebook.service.js";
import StreamModel from "../models/streams.models.js";
import { ApiError } from "../utils/ApiError.js"; // ✅ Import ApiError

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
  let youtubeStreamKey = null;

  // --- YOUTUBE SETUP ---
  if (youtube) {
    const record = await getTokenRecord({ userId, provider: "youtube" });

    // ✅ Throw 400 so frontend knows user needs to connect account
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

      // Validation to ensure API returned expected data
      if (!ingestUrl || !stream?.cdn?.ingestionInfo?.streamName) {
        throw new Error("Invalid response from YouTube API");
      }

      youtubeKey = ingestUrl;
      console.log("youtubeKey generated:", youtubeKey);

      youtubeStreamKey = stream.cdn.ingestionInfo.streamName;
      shareUrls.youtube = `https://www.youtube.com/watch?v=${broadcast.id}`;
    } catch (error) {
      console.error("YouTube Setup Error:", error);
      // ✅ Throw 502 for external API failures (Bad Gateway)
      // This catches quota limits, invalid tokens, or network issues
      throw new ApiError(502, `YouTube Setup Failed: ${error.message}`);
    }
  }

  // --- FACEBOOK SETUP ---
  if (facebook) {
    const record = await getTokenRecord({ userId, provider: "facebook" });

    // ✅ Throw 400 for missing connection
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
    } catch (error) {
      console.error("Facebook Setup Error:", error);
      throw new ApiError(502, `Facebook Setup Failed: ${error.message}`);
    }
  }

  // --- INSTAGRAM SETUP (Placeholder validation) ---
  if (instagram) {
    // If you haven't implemented Instagram yet, throw error
    // throw new ApiError(501, "Instagram streaming is coming soon!");
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
      youtubeKey: youtubeKey,
      facebookKey,
      instagramKey,
      overlays,
      shareUrls,
      token: null,
    });
  } catch (error) {
    console.error("Database Error:", error);
    throw new ApiError(500, "Failed to save stream session to database");
  }

  activeSessions.set(sessionId, {
    userId,
    youtubeKey,
    facebookKey,
    instagramKey,
    overlays,
  });

  return { sessionId, shareUrls };
}
