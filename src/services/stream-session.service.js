// src/services/stream-session.service.js
import { ApiError } from "../utils/ApiError.js";
import StreamModel from "../models/streams.models.js";
import { startPolling, stopPolling } from "./social.service.js";

const activeSessions = new Map();

/**
 * Start a stream session and begin social polling
 */
export async function start(sessionId) {
  // Get stream configuration from database
  const stream = await StreamModel.get(sessionId);
  if (!stream) {
    throw new ApiError(404, "Stream session not found");
  }

  // Extract YouTube and Facebook broadcast IDs
  const youtubeLiveId = extractYouTubeBroadcastId(
    stream.youtube_key,
    stream.share_urls?.youtube,
  );
  const facebookLiveId = extractFacebookLiveId(
    stream.facebook_key,
    stream.share_urls?.facebook,
  );

  // Update stream status to live
  await StreamModel.updateStatus(sessionId, "live");

  // Start social media polling for real-time stats
  if (youtubeLiveId || facebookLiveId) {
    startPolling(sessionId, stream.user_id, youtubeLiveId, facebookLiveId);
  }

  // Store active session info
  activeSessions.set(sessionId, {
    userId: stream.user_id,
    youtubeLiveId,
    facebookLiveId,
    startedAt: new Date(),
  });

  return {
    sessionId,
    status: "live",
    youtubeLiveId,
    facebookLiveId,
  };
}

/**
 * Stop a stream session and cleanup
 */
export async function stop(sessionId) {
  // Stop social polling
  stopPolling(sessionId);

  // Update database status
  await StreamModel.updateStatus(sessionId, "ended");

  // Remove from active sessions
  activeSessions.delete(sessionId);

  return { sessionId, status: "ended" };
}

/**
 * Restart stream (for camera toggle, etc.)
 */
export async function restart(sessionId, isCameraOn) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new ApiError(404, "Active stream session not found");
  }

  // Here you would restart your FFmpeg process or WebRTC connection
  // For now, we'll just acknowledge the restart
  console.log(`Restarting stream ${sessionId} with camera: ${isCameraOn}`);

  return {
    sessionId,
    restarted: true,
    isCameraOn,
  };
}

/**
 * Update overlays for active stream
 */
export async function updateOverlays(sessionId, overlays) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new ApiError(404, "Active stream session not found");
  }

  // Update overlays in your streaming pipeline
  console.log(`Updating overlays for ${sessionId}:`, overlays);

  return { sessionId, overlays };
}

/**
 * Extract YouTube broadcast ID from various sources
 */
function extractYouTubeBroadcastId(youtubeKey, shareUrl) {
  // Try to extract from share URL first (most reliable)
  if (shareUrl) {
    // URL format: https://www.youtube.com/watch?v=BROADCAST_ID
    const match = shareUrl.match(/[?&]v=([^&]+)/);
    if (match) return match[1];
  }

  // If youtube_key is stored as full URL, extract from there
  if (youtubeKey && youtubeKey.includes("youtube.com")) {
    const match = youtubeKey.match(/[?&]v=([^&]+)/);
    if (match) return match[1];
  }

  return null;
}

/**
 * Extract Facebook live video ID from various sources
 */
function extractFacebookLiveId(facebookKey, shareUrl) {
  // Try to extract from share URL
  if (shareUrl) {
    // URL format: https://www.facebook.com/username/videos/VIDEO_ID/
    const match = shareUrl.match(/videos\/(\d+)/);
    if (match) return match[1];
  }

  // If facebookKey contains the video ID
  if (facebookKey && /^\d+$/.test(facebookKey)) {
    return facebookKey;
  }

  return null;
}

/**
 * Get active session info
 */
export function getActiveSession(sessionId) {
  return activeSessions.get(sessionId);
}

/**
 * Get all active sessions
 */
export function getAllActiveSessions() {
  return Array.from(activeSessions.entries()).map(([id, data]) => ({
    sessionId: id,
    ...data,
  }));
}
