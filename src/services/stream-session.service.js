import {
  initMediasoup,
  createRtpOutputForSession,
  stopSession,
} from "./webrtc.service.js";
import { ffmpegService } from "./ffmpeg.service.js";
import StreamModel from "../models/streams.models.js";

// In-memory cache
const activeSessions = new Map();

// ✅ EXPORT 'start' FUNCTION
export async function start(sessionId) {
  const cfg = await loadSession(sessionId);

  // Ensure IO is passed (fallback to global if not passed explicitly)
  await initMediasoup(global.io);

  const basePort = 10000 + Math.floor(Math.random() * 5000) * 2;

  const ports = await createRtpOutputForSession(sessionId, basePort);

  // Extract codec name: "video/H264" -> "H264"
  const codecName = ports.videoCodecMime
    ? ports.videoCodecMime.split("/")[1]
    : "H264";

  console.log(`[StreamSession] Starting FFmpeg with codec: ${codecName}`);

  const ff = ffmpegService.start(
    sessionId,
    ports.audioPort,
    ports.videoPort,
    ports.screenPort,
    cfg.youtubeKey,
    cfg.facebookKey,
    cfg.instagramKey,
    ports.videoPayloadType,
    ports.audioPayloadType,
    ports.screenPayloadType,
    ports.hasScreen,
    true, // isCameraOn
    codecName, // ✅ Pass codec name
  );

  await StreamModel.updateStatus(sessionId, "live");

  return { sessionId, ...ports, ff };
}

export async function stop(sessionId) {
  ffmpegService.stop(sessionId);
  await stopSession(sessionId);
  await StreamModel.updateStatus(sessionId, "ended");
}

export async function restart(sessionId, isCameraOn) {
  const cfg = await loadSession(sessionId);

  ffmpegService.stop(sessionId);

  const basePort = 10000 + Math.floor(Math.random() * 5000) * 2;

  const ports = await createRtpOutputForSession(sessionId, basePort);
  const codecName = ports.videoCodecMime
    ? ports.videoCodecMime.split("/")[1]
    : "H264";

  console.log(`[StreamSession] Restarting FFmpeg with codec: ${codecName}`);

  const ff = ffmpegService.start(
    sessionId,
    ports.audioPort,
    ports.videoPort,
    ports.screenPort,
    cfg.youtubeKey,
    cfg.facebookKey,
    cfg.instagramKey,
    ports.videoPayloadType,
    ports.audioPayloadType,
    ports.screenPayloadType,
    ports.hasScreen,
    isCameraOn,
    codecName,
  );

  return { restarted: true, hasScreen: ports.hasScreen, isCameraOn };
}

export async function updateOverlays(sessionId, overlays) {
  // Update local cache if session is active
  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.overlays = overlays;
    activeSessions.set(sessionId, session);
  }
  // Update the Overlay Service (which writes to the .txt files for FFmpeg)
  const { overlayService } = await import("./overlay.service.js");
  overlayService.update(overlays);
}

async function loadSession(sessionId) {
  let cfg = activeSessions.get(sessionId);

  if (!cfg) {
    const row = await StreamModel.get(sessionId);
    if (!row) throw new Error("Session not found");

    cfg = {
      userId: row.user_id,
      youtubeKey: row.youtube_key,
      facebookKey: row.facebook_key,
      instagramKey: row.instagram_key,
      overlays: row.overlays,
    };
    activeSessions.set(sessionId, cfg);
  }
  return cfg;
}
