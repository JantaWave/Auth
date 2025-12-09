// src/services/social/youtube.service.js
import axios from "axios";

/**
 * Create a YouTube Broadcast
 */
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
          privacyStatus: "unlisted",
        },
        contentDetails: {
          enableAutoStart: true,
          enableAutoStop: true, // ensure auto stop also works
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    return data;
  } catch (error) {
    console.error(
      "createLiveBroadcast error:",
      error.response?.data || error.message,
    );
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

/**
 * Create a YouTube Stream (ingestion info)
 */
export async function createLiveStream(accessToken, { title, description }) {
  try {
    const { data } = await axios.post(
      "https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,contentDetails,status",
      {
        snippet: { title, description },
        cdn: {
          ingestionType: "rtmp",
          resolution: "1080p",
          frameRate: "60fps",
        },
        contentDetails: {
          isReusable: false,
          enableAutoStart: true,
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    return data;
  } catch (error) {
    console.error(
      "createLiveStream error:",
      error.response?.data || error.message,
    );
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

/**
 * Bind the created stream to a broadcast
 */
export async function bindStreamToBroadcast(
  accessToken,
  { broadcastId, streamId },
) {
  try {
    const { data } = await axios.post(
      `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?part=id,contentDetails&streamId=${streamId}&id=${broadcastId}`,
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    return data;
  } catch (error) {
    console.error(
      "bindStreamToBroadcast error:",
      error.response?.data || error.message,
    );
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

/**
 * Normalize YouTube ingest URL to always end with /live2/STREAM_KEY
 */
function buildSafeYouTubeIngestUrl(ingestionAddress, streamName) {
  // 1. Remove query parameters
  let baseUrl = ingestionAddress.split("?")[0];

  // 2. Remove trailing slashes
  baseUrl = baseUrl.replace(/\/+$/, "");

  // 3. Ensure it ends in /live2
  if (!baseUrl.endsWith("/live2")) {
    baseUrl = baseUrl + "/live2";
  }

  // 4. Return correct RTMP URL
  return `${baseUrl}/${streamName}`;
}
/**
 * Combined: Create Broadcast + Stream + Bind → Return Safe RTMP URL
 */
export async function createYouTubeStream(
  accessToken,
  title,
  description,
  scheduledStartTime,
) {
  const broadcast = await createLiveBroadcast(accessToken, {
    title,
    description,
    scheduledStartTime,
  });

  const stream = await createLiveStream(accessToken, {
    title: `${title} Stream`,
    description,
  });

  await bindStreamToBroadcast(accessToken, {
    broadcastId: broadcast.id,
    streamId: stream.id,
  });

  if (!stream.cdn?.ingestionInfo) {
    throw new Error("YouTube did not return ingestion info");
  }

  const { ingestionAddress, streamName } = stream.cdn.ingestionInfo;

  // ✅ USE THE FIXED FUNCTION
  const ingestUrl = buildSafeYouTubeIngestUrl(ingestionAddress, streamName);

  console.log("🎯 Final YouTube RTMP URL:", ingestUrl);

  return {
    broadcast,
    stream,
    ingestUrl,
  };
}
