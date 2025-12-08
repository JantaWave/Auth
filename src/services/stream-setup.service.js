import { createSessionId } from "./webrtc.service.js";
import { getTokenRecord, ensureAccessToken } from "./tokenMangaer.js";
import * as YouTubeService from "./social/youtube.service.js";
import * as FacebookService from "./social/facebook.service.js";

import StreamModel from "../models/streams.models.js";

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

  if (youtube) {
    const record = await getTokenRecord({ userId, provider: "youtube" });
    if (!record) throw new Error("YouTube not connected");

    const { access_token } = await ensureAccessToken(record);

    const { broadcast, stream, ingestUrl } =
      await YouTubeService.createYouTubeStream(
        access_token,
        title,
        description,
        scheduledStartTime,
      );

    youtubeKey = ingestUrl;
    youtubeStreamKey = stream.cdn.ingestionInfo.streamName;
    shareUrls.youtube = `https://www.youtube.com/watch?v=${broadcast.id}`;
  }

  if (facebook) {
    const record = await getTokenRecord({ userId, provider: "facebook" });
    if (!record) throw new Error("Facebook not connected");

    const { access_token } = await ensureAccessToken(record);

    const fb = await FacebookService.createFacebookStream(access_token);

    facebookKey = fb.rtmp;
    shareUrls.facebook = fb.watchUrl;
  }

  // Save in DB
  await StreamModel.add({
    id: sessionId,
    userId,
    title,
    description,
    thumbnailUrl: overlays?.logoUrl || null,
    scheduledStartTime,
    youtubeKey: youtubeStreamKey,
    facebookKey,
    instagramKey,
    overlays,
    shareUrls,
    token: null,
  });

  activeSessions.set(sessionId, {
    userId,
    youtubeKey,
    facebookKey,
    instagramKey,
    overlays,
  });

  return { sessionId, shareUrls };
}
