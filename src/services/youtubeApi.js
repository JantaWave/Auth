import axios from "axios";
import qs from "qs";
import { google } from "googleapis";

const youtube = google.youtube("v3");
const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * createLiveBroadcast - creates a broadcast object
 * docs: https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/insert
 */

// This function should run inside a setInterval loop while the stream is active
export async function pollYouTubeStats(
  io,
  sessionId,
  accessToken,
  liveBroadcastId,
) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  try {
    // 1. Get View Count & Chat ID
    const streamDetails = await youtube.videos.list({
      auth,
      part: ["liveStreamingDetails", "statistics"],
      id: [liveBroadcastId],
    });

    const item = streamDetails.data.items[0];
    const liveDetails = item?.liveStreamingDetails;
    const statistics = item?.statistics;

    const concurrentViewers = liveDetails?.concurrentViewers || 0;
    const activeLiveChatId = liveDetails?.activeLiveChatId;

    // ✅ Extract Like Count (YouTube API returns it as string)
    const likeCount = statistics?.likeCount
      ? parseInt(statistics.likeCount)
      : 0;
    // 2. Get Recent Chat Messages
    let newComments = [];
    if (activeLiveChatId) {
      const chatResponse = await youtube.liveChatMessages.list({
        auth,
        liveChatId: activeLiveChatId,
        part: ["snippet", "authorDetails"],
        maxResults: 10, // Adjust based on quota
      });

      newComments = chatResponse.data.items.map((item) => ({
        id: item.id,
        user: item.authorDetails.displayName,
        text: item.snippet.displayMessage,
        platform: "YouTube",
        avatar: item.authorDetails.profileImageUrl,
      }));
    }

    // 3. Emit to Frontend via Socket.io
    io.to(sessionId).emit("social_update", {
      views: {
        youtube: parseInt(concurrentViewers),
        // Add facebook/twitch logic here later
      },
      comments: newComments,
    });
  } catch (error) {
    console.error("YouTube Polling Error:", error);
  }
}

export async function createLiveBroadcast(
  access_token,
  {
    title = "My Live",
    description = "",
    scheduledStartTime = null,
    scheduledEndTime = null,
  },
) {
  const params = {
    part: "snippet,status,contentDetails",
  };

  const body = {
    snippet: {
      title,
      description,
      ...(scheduledStartTime ? { scheduledStartTime } : {}),
      ...(scheduledEndTime ? { scheduledEndTime } : {}),
    },
    status: {
      privacyStatus: "unlisted",
    },
  };

  const resp = await axios.post(
    `${YT_API_BASE}/liveBroadcasts?${qs.stringify(params)}`,
    body,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    },
  );

  return resp.data;
}

/**
 * createLiveStream - creates a live stream and returns ingestion info
 * docs: https://developers.google.com/youtube/v3/live/docs/liveStreams/insert
 */
export async function createLiveStream(
  access_token,
  { title = "My Stream", description = "" },
) {
  const params = {
    part: "snippet,cdn,contentDetails",
  };

  const body = {
    snippet: {
      title,
      description,
    },
    cdn: {
      ingestionType: "rtmp",
      resolution: "variable",
      frameRate: "variable",
    },
  };

  const resp = await axios.post(
    `${YT_API_BASE}/liveStreams?${qs.stringify(params)}`,
    body,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    },
  );

  return resp.data;
}

/**
 * bindStreamToBroadcast - binds liveStream to liveBroadcast
 * docs: https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/bind
 */
export async function bindStreamToBroadcast(
  access_token,
  { broadcastId, streamId },
) {
  const params = {
    id: broadcastId,
    part: "id,contentDetails",
    streamId,
  };

  // Note: the v3 endpoint uses broadcasts/bind
  const resp = await axios.post(
    `${YT_API_BASE}/liveBroadcasts/bind?${qs.stringify({ part: "id,contentDetails", id: broadcastId, streamId })}`,
    null,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    },
  );

  return resp.data;
}
