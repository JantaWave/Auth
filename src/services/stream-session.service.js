// src/services/stream-session.service.js

import {
  initMediasoup,
  createRtpOutputForSession,
  stopSession,
  debugSessions, // optional
} from "./webrtc.service.js";
import { ffmpegService } from "./ffmpeg.service.js";
import StreamModel from "../models/streams.models.js";

// In-memory cache
const activeSessions = new Map();

export async function start(sessionId) {
  const cfg = await loadSession(sessionId);

  await initMediasoup(global.io);

  const basePort = 10000 + Math.floor(Math.random() * 5000) * 2;

  const ports = await createRtpOutputForSession(sessionId, basePort);

  console.log(`[RTP OUT] creating RTP output for session ${sessionId}`);
  // console.log("Sessions:", debugSessions()); // safe now

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

  const basePort = 10000 + Math.random() * 3000;

  const ports = await createRtpOutputForSession(sessionId, basePort);

  console.log(`[RTP OUT] creating RTP output for session ${sessionId}`);
  // console.log("Sessions:", debugSessions()); // safe debugging

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
  );

  return { restarted: true, hasScreen: ports.hasScreen, isCameraOn };
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
