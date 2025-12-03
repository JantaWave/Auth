// src/services/social.service.js
import axios from "axios";
import { io } from "../socket.js";
import { getTokenRecord, ensureAccessToken } from "./tokenMangaer.js";

const activeStreams = new Map();

export function startPolling(sessionId, userId, youtubeLiveId, facebookLiveId) {
  if (activeStreams.has(sessionId)) return;

  console.log(`Started polling social data for session: ${sessionId}`);

  const interval = setInterval(async () => {
    try {
      // Initialize Stats Structure
      const stats = {
        views: {
          youtube: 0,
          facebook: 0,
          instagram: 0,
          total: 0, // Aggregate Count
        },
        comments: [],
      };

      // --- 1. YouTube Polling ---
      if (youtubeLiveId) {
        const record = await getTokenRecord({ userId, provider: "youtube" });
        if (record) {
          const { access_token } = await ensureAccessToken(record);

          // A. Get Viewers
          try {
            const vidRes = await axios.get(
              `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${youtubeLiveId}`,
              { headers: { Authorization: `Bearer ${access_token}` } },
            );
            const details = vidRes.data.items[0]?.liveStreamingDetails;
            const ytViews = parseInt(details?.concurrentViewers || 0);

            stats.views.youtube = ytViews;
            stats.views.total += ytViews; // Add to aggregate

            // B. Get Comments
            const chatId = details?.activeLiveChatId;
            if (chatId) {
              const chatRes = await axios.get(
                `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${chatId}&part=snippet,authorDetails`,
                { headers: { Authorization: `Bearer ${access_token}` } },
              );

              const ytComments = chatRes.data.items.map((item) => ({
                id: item.id,
                user: item.authorDetails.displayName,
                avatar: item.authorDetails.profileImageUrl,
                text: item.snippet.displayMessage,
                platform: "youtube", // Tag for UI
                timestamp: item.snippet.publishedAt,
              }));

              stats.comments.push(...ytComments);
            }
          } catch (err) {
            // Suppress errors if stream is just starting/ending
            if (err.response?.status !== 403)
              console.error("YouTube Poll Error:", err.message);
          }
        }
      }

      // --- 2. Facebook Polling (Requires 'user_videos' permission) ---
      if (facebookLiveId) {
        // Logic similar to YouTube would go here if you have a verified FB App.
        // Without verification, this API call will likely fail or return 0.
      }

      // --- 3. Emit to App ---
      // The Frontend receives this and updates the UI
      io.to(sessionId).emit("social_update", stats);
    } catch (e) {
      console.error("Polling Loop Error:", e.message);
    }
  }, 10000); // Poll every 10 seconds

  activeStreams.set(sessionId, interval);
}

export function stopPolling(sessionId) {
  const interval = activeStreams.get(sessionId);
  if (interval) {
    clearInterval(interval);
    activeStreams.delete(sessionId);
  }
}
