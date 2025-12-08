// src/services/social/facebook.service.js
import axios from "axios";

/**
 * Create Facebook live video → returns RTMP URL + watch URL
 */
export async function createFacebookStream(accessToken) {
  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/me/live_videos`,
      {
        status: "LIVE_NOW",
        description: "Live Stream via JantaWave",
      },
      { params: { access_token: accessToken } },
    );

    return {
      rtmp: data.secure_stream_url || data.stream_url,
      id: data.id,
      watchUrl: `https://facebook.com/${data.id}`,
    };
  } catch (error) {
    console.error("Facebook API Error:", error.response?.data || error.message);
    throw new Error("Failed to create Facebook Live stream");
  }
}
