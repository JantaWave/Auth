// src/services/social.service.js
import axios from "axios";
import { io } from "../socket.js";
import { getTokenRecord, ensureAccessToken } from "./tokenMangaer.js";

const activeStreams = new Map();
// Store last processed comment IDs to avoid duplicates
const processedComments = new Map();

export function startPolling(sessionId, userId, youtubeLiveId, facebookLiveId) {
  if (activeStreams.has(sessionId)) return;

  console.log(`Started polling social data for session: ${sessionId}`);

  // Initialize comment tracking for this session
  if (!processedComments.has(sessionId)) {
    processedComments.set(sessionId, new Set());
  }

  const interval = setInterval(async () => {
    try {
      // Initialize Stats Structure
      const stats = {
        views: {
          youtube: 0,
          facebook: 0,
          instagram: 0,
          total: 0,
        },
        likes: {
          youtube: 0,
          facebook: 0,
        },
        comments: [],
      };

      // --- 1. YouTube Polling ---
      if (youtubeLiveId) {
        const record = await getTokenRecord({ userId, provider: "youtube" });
        if (record) {
          const { access_token } = await ensureAccessToken(record);

          // A. Get Video Statistics & Live Details
          try {
            const vidRes = await axios.get(
              `https://www.googleapis.com/youtube/v3/videos`,
              {
                params: {
                  part: "liveStreamingDetails,statistics",
                  id: youtubeLiveId,
                },
                headers: { Authorization: `Bearer ${access_token}` },
              },
            );

            const video = vidRes.data.items?.[0];
            if (video) {
              const details = video.liveStreamingDetails;
              const statistics = video.statistics;

              // Set viewer count
              const ytViews = parseInt(details?.concurrentViewers || 0);
              stats.views.youtube = ytViews;
              stats.views.total += ytViews;

              // Set like count
              const ytLikes = parseInt(statistics?.likeCount || 0);
              stats.likes.youtube = ytLikes;

              // B. Get Live Chat Messages (Comments)
              const chatId = details?.activeLiveChatId;
              if (chatId) {
                const ytComments = await fetchYouTubeComments(
                  chatId,
                  access_token,
                  sessionId,
                );
                stats.comments.push(...ytComments);
              }
            }
          } catch (err) {
            // Suppress 403 errors (stream starting/ending)
            if (err.response?.status !== 403) {
              console.error("YouTube Poll Error:", err.message);
            }
          }
        }
      }

      // --- 2. Facebook Polling ---
      if (facebookLiveId) {
        const record = await getTokenRecord({ userId, provider: "facebook" });
        if (record) {
          const { access_token } = await ensureAccessToken(record);

          try {
            // Get Facebook Live Video stats
            const fbRes = await axios.get(
              `https://graph.facebook.com/v18.0/${facebookLiveId}`,
              {
                params: {
                  fields:
                    "live_views,reactions.summary(true),comments.limit(50){from,message,created_time}",
                  access_token,
                },
              },
            );

            const fbData = fbRes.data;

            // Set viewer count
            const fbViews = parseInt(fbData.live_views || 0);
            stats.views.facebook = fbViews;
            stats.views.total += fbViews;

            // Set like count (reactions)
            const fbLikes = parseInt(
              fbData.reactions?.summary?.total_count || 0,
            );
            stats.likes.facebook = fbLikes;

            // Process Facebook comments
            if (fbData.comments?.data) {
              const fbComments = fbData.comments.data
                .filter((comment) => !isCommentProcessed(sessionId, comment.id))
                .map((comment) => {
                  markCommentAsProcessed(sessionId, comment.id);
                  return {
                    id: comment.id,
                    user: comment.from?.name || "Facebook User",
                    avatar: null,
                    text: comment.message,
                    platform: "Facebook",
                    timestamp: comment.created_time,
                  };
                });

              stats.comments.push(...fbComments);
            }
          } catch (err) {
            console.error("Facebook Poll Error:", err.message);
          }
        }
      }

      // --- 3. Emit to Frontend ---
      // Only emit if there's data to send
      if (stats.views.total > 0 || stats.comments.length > 0) {
        io.to(sessionId).emit("social_update", stats);
      }
    } catch (e) {
      console.error("Polling Loop Error:", e.message);
    }
  }, 5000); // Poll every 5 seconds for better real-time feel

  activeStreams.set(sessionId, interval);
}

/**
 * Fetch YouTube live chat messages
 */
async function fetchYouTubeComments(chatId, accessToken, sessionId) {
  try {
    const chatRes = await axios.get(
      `https://www.googleapis.com/youtube/v3/liveChat/messages`,
      {
        params: {
          liveChatId: chatId,
          part: "snippet,authorDetails",
          maxResults: 200, // Get up to 200 recent messages
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const items = chatRes.data.items || [];

    // Filter out already processed comments
    const newComments = items
      .filter((item) => !isCommentProcessed(sessionId, item.id))
      .map((item) => {
        // Mark as processed
        markCommentAsProcessed(sessionId, item.id);

        return {
          id: item.id,
          user: item.authorDetails?.displayName || "YouTube User",
          avatar: item.authorDetails?.profileImageUrl || null,
          text: item.snippet?.displayMessage || "",
          platform: "YouTube",
          timestamp: item.snippet?.publishedAt,
        };
      });

    return newComments;
  } catch (err) {
    console.error("YouTube Chat Fetch Error:", err.message);
    return [];
  }
}

/**
 * Check if a comment has already been processed
 */
function isCommentProcessed(sessionId, commentId) {
  const processed = processedComments.get(sessionId);
  return processed ? processed.has(commentId) : false;
}

/**
 * Mark a comment as processed to avoid duplicates
 */
function markCommentAsProcessed(sessionId, commentId) {
  let processed = processedComments.get(sessionId);
  if (!processed) {
    processed = new Set();
    processedComments.set(sessionId, processed);
  }
  processed.add(commentId);

  // Limit set size to prevent memory issues (keep last 1000 comment IDs)
  if (processed.size > 1000) {
    const toDelete = Array.from(processed).slice(0, processed.size - 1000);
    toDelete.forEach((id) => processed.delete(id));
  }
}

/**
 * Stop polling and clean up
 */
export function stopPolling(sessionId) {
  const interval = activeStreams.get(sessionId);
  if (interval) {
    clearInterval(interval);
    activeStreams.delete(sessionId);
  }

  // Clean up processed comments for this session
  processedComments.delete(sessionId);
  console.log(`Stopped polling for session: ${sessionId}`);
}

/**
 * Get current stats without starting polling
 */
export async function getCurrentStats(
  sessionId,
  userId,
  youtubeLiveId,
  facebookLiveId,
) {
  const stats = {
    views: { youtube: 0, facebook: 0, total: 0 },
    likes: { youtube: 0, facebook: 0 },
    comments: [],
  };

  // Fetch YouTube stats
  if (youtubeLiveId) {
    const record = await getTokenRecord({ userId, provider: "youtube" });
    if (record) {
      const { access_token } = await ensureAccessToken(record);

      try {
        const vidRes = await axios.get(
          `https://www.googleapis.com/youtube/v3/videos`,
          {
            params: {
              part: "liveStreamingDetails,statistics",
              id: youtubeLiveId,
            },
            headers: { Authorization: `Bearer ${access_token}` },
          },
        );

        const video = vidRes.data.items?.[0];
        if (video) {
          stats.views.youtube = parseInt(
            video.liveStreamingDetails?.concurrentViewers || 0,
          );
          stats.likes.youtube = parseInt(video.statistics?.likeCount || 0);
          stats.views.total += stats.views.youtube;
        }
      } catch (err) {
        console.error("YouTube Stats Error:", err.message);
      }
    }
  }

  return stats;
}
