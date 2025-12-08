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
          enableAutoStop: false,
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
          resolution: "variable",
          frameRate: "variable",
        },
        contentDetails: { isReusable: false },
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
 * Combined: Create Broadcast + Stream + Bind → Return RTMP URL
 */
export async function createYouTubeStream(
  accessToken,
  title,
  description,
  scheduledStartTime,
) {
  // 1. Create Broadcast
  const broadcast = await createLiveBroadcast(accessToken, {
    title,
    description,
    scheduledStartTime,
  });

  // 2. Create Stream
  const stream = await createLiveStream(accessToken, {
    title: `${title} Stream`,
    description,
  });

  // 3. Bind Stream → Broadcast
  await bindStreamToBroadcast(accessToken, {
    broadcastId: broadcast.id,
    streamId: stream.id,
  });

  if (!stream.cdn?.ingestionInfo) {
    throw new Error("YouTube did not return ingestion info");
  }

  const { ingestionAddress, streamName } = stream.cdn.ingestionInfo;

  return {
    broadcast,
    stream,
    ingestUrl: `${ingestionAddress}/${streamName}`,
  };
}
