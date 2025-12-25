import {
  initMediasoup,
  createRtpOutputForSession,
  stopSession,
} from "./webrtc.service.js";
import { ffmpegService } from "./ffmpeg.service.js";
import StreamModel from "../models/streams.models.js";
import path from "path";

// In-memory cache
const activeSessions = new Map();

// ✅ EXPORT 'start' FUNCTION
export async function start(
  sessionId,
  streamFormat = "portrait",
  logoPath = null,
) {
  const cfg = await loadSession(sessionId);

  // Ensure IO is passed (fallback to global if not passed explicitly)
  await initMediasoup(global.io);

  const basePort = 10000 + Math.floor(Math.random() * 5000) * 2;
  const ports = await createRtpOutputForSession(sessionId, basePort);

  // Extract codec name: "video/H264" -> "H264"
  const codecName = ports.videoCodecMime
    ? ports.videoCodecMime.split("/")[1]
    : "H264";

  console.log(
    `[StreamSession] Starting FFmpeg with codec: ${codecName}, format: ${streamFormat}`,
  );

  // ✅ Corrected parameter order matching ffmpegService.start signature
  const ff = ffmpegService.start(
    sessionId,
    ports.audioPort,
    ports.videoPort,
    ports.screenPort,
    cfg.youtubeKey,
    cfg.facebookKey,
    cfg.instagramKey,
    ports.videoPayloadType, // videoPT
    ports.audioPayloadType, // audioPT
    ports.screenPayloadType, // screenPT
    ports.hasScreen, // hasScreen
    true, // isCameraOn
    codecName, // videoCodec (H264, VP8, VP9)
    streamFormat, // streamFormat ('landscape' or 'portrait')
    logoPath, // logoPath (optional)
  );

  // Store format preference in session
  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.streamFormat = streamFormat;
    session.logoPath = logoPath;
    activeSessions.set(sessionId, session);
  }

  await StreamModel.updateStatus(sessionId, "live");

  return { sessionId, streamFormat, ...ports, ff };
}

export async function stop(sessionId) {
  ffmpegService.stop(sessionId);
  await stopSession(sessionId);
  await StreamModel.updateStatus(sessionId, "ended");
  activeSessions.delete(sessionId);
}

export async function restart(
  sessionId,
  isCameraOn = true,
  streamFormat = null,
  logoPath = null,
) {
  const cfg = await loadSession(sessionId);

  // Use stored format if not provided
  if (!streamFormat && activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    streamFormat = session.streamFormat || "portrait";
    logoPath = logoPath || session.logoPath;
  }
  streamFormat = streamFormat || "portrait";

  ffmpegService.stop(sessionId);

  const basePort = 10000 + Math.floor(Math.random() * 5000) * 2;
  const ports = await createRtpOutputForSession(sessionId, basePort);

  const codecName = ports.videoCodecMime
    ? ports.videoCodecMime.split("/")[1]
    : "H264";

  console.log(
    `[StreamSession] Restarting FFmpeg with codec: ${codecName}, format: ${streamFormat}, camera: ${isCameraOn}`,
  );

  // ✅ Corrected parameter order
  const ff = ffmpegService.start(
    sessionId,
    ports.audioPort,
    ports.videoPort,
    ports.screenPort,
    cfg.youtubeKey,
    cfg.facebookKey,
    cfg.instagramKey,
    ports.videoPayloadType, // videoPT
    ports.audioPayloadType, // audioPT
    ports.screenPayloadType, // screenPT
    ports.hasScreen, // hasScreen
    isCameraOn, // isCameraOn
    codecName, // videoCodec
    streamFormat, // streamFormat
    logoPath, // logoPath
  );

  // Update session cache
  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.streamFormat = streamFormat;
    session.logoPath = logoPath;
    activeSessions.set(sessionId, session);
  }

  return {
    restarted: true,
    hasScreen: ports.hasScreen,
    isCameraOn,
    streamFormat,
  };
}

export async function switchFormat(sessionId, newFormat) {
  /**
   * Switch between landscape and portrait on the fly
   * This requires a restart of FFmpeg
   */
  if (!["landscape", "portrait"].includes(newFormat)) {
    throw new Error("Invalid format. Use 'landscape' or 'portrait'");
  }

  console.log(`[StreamSession] Switching format to: ${newFormat}`);

  // Get current camera state before restart
  const session = activeSessions.get(sessionId);
  const isCameraOn = session?.isCameraOn !== false; // default true
  const logoPath = session?.logoPath;

  return await restart(sessionId, isCameraOn, newFormat, logoPath);
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

export async function setLogo(sessionId, logoPath) {
  /**
   * Set or update the logo for a stream
   * Logo should be a PNG file with transparency
   */
  if (logoPath && !path.extname(logoPath).match(/\.(png|svg)$/i)) {
    throw new Error("Logo must be a PNG or SVG file with transparency");
  }

  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.logoPath = logoPath;
    activeSessions.set(sessionId, session);

    console.log(`[StreamSession] Logo updated for session ${sessionId}`);

    // Restart stream to apply logo
    const isCameraOn = session.isCameraOn !== false;
    const streamFormat = session.streamFormat || "portrait";
    return await restart(sessionId, isCameraOn, streamFormat, logoPath);
  }

  throw new Error("Session not active");
}

export async function getSessionInfo(sessionId) {
  /**
   * Get current session configuration
   */
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  return {
    sessionId,
    streamFormat: session.streamFormat || "portrait",
    logoPath: session.logoPath,
    overlays: session.overlays,
    isCameraOn: session.isCameraOn !== false,
  };
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
      streamFormat: row.stream_format || "portrait", // Default to portrait
      logoPath: row.logo_path || null,
      isCameraOn: true,
    };

    activeSessions.set(sessionId, cfg);
  }

  return cfg;
}
