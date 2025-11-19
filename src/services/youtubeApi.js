import axios from "axios";
import qs from "qs";

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * createLiveBroadcast - creates a broadcast object
 * docs: https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/insert
 */
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
