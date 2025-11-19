// src/services/ffmpeg.service.js
import { spawn } from "child_process";
import { info, error } from "../utils/logger.js";
import { overlayService } from "./overlay.service.js";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

function escapeDrawText(s = "") {
  // minimal escape for colon and single quotes
  return String(s).replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * ffmpegService: start/stop ffmpeg processes keyed by sessionId
 */
class FfmpegService {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * start FFmpeg reading UDP RTP (video/audio) and streaming via tee to RTMP endpoints
   * audioPort/videoPort = UDP ports where mediasoup plain transport pushes RTP
   * youtubeKey/facebookKey/instagramKey: either full rtmp url or just key
   */
  start(
    sessionId,
    audioPort,
    videoPort,
    youtubeKey,
    facebookKey,
    instagramKey,
  ) {
    if (this.sessions.has(sessionId)) {
      throw new Error("ffmpeg already running for " + sessionId);
    }

    const overlays = overlayService.get();

    const videoInput = `udp://127.0.0.1:${videoPort}?fifo_size=500000&overrun_nonfatal=1`;
    const audioInput = `udp://127.0.0.1:${audioPort}?fifo_size=500000&overrun_nonfatal=1`;

    // optional logo input (single image)
    const logoInput = overlays.logoUrl ? ["-i", overlays.logoUrl] : [];

    // Build filter_complex
    const filters = [];
    let videoLabel = "[0:v]";

    if (overlays.logoUrl) {
      // logo is the last input index (0: video, 1: audio, 2: logo)
      filters.push(
        "[0:v][2:v] overlay=main_w-overlay_w-10:10:format=auto [v1]",
      );
      videoLabel = "[v1]";
    }

    if (overlays.title) {
      filters.push(
        `${videoLabel} drawtext=text='${escapeDrawText(
          overlays.title,
        )}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontsize=36:box=1:boxcolor=black@0.5:boxborderw=5:x=(w-text_w)/2:y=h-120 [v2]`,
      );
      videoLabel = "[v2]";
    }

    if (overlays.bannerText) {
      filters.push(
        `${videoLabel} drawtext=text='${escapeDrawText(
          overlays.bannerText,
        )}':fontsize=28:box=1:boxcolor=black@0.4:boxborderw=4:x=10:y=10 [v3]`,
      );
      videoLabel = "[v3]";
    }

    if (overlays.ticker) {
      filters.push(
        `${videoLabel} drawtext=text='${escapeDrawText(
          overlays.ticker,
        )}':fontsize=22:x=w-mod(max(t\\,0)*100\\,w+tw):y=h-50:box=1:boxcolor=black@0.4:boxborderw=2 [v4]`,
      );
      videoLabel = "[v4]";
    }

    const filterComplex = filters.length
      ? ["-filter_complex", filters.join(";")]
      : [];

    // Build RTMP target list
    const targets = [];
    if (youtubeKey) {
      targets.push(
        youtubeKey.startsWith("rtmp")
          ? youtubeKey
          : `rtmp://a.rtmp.youtube.com/live2/${youtubeKey}`,
      );
    }
    if (facebookKey) {
      targets.push(
        facebookKey.startsWith("rtmp")
          ? facebookKey
          : `rtmps://live-api-s.facebook.com:443/rtmp/${facebookKey}`,
      );
    }
    if (instagramKey) {
      targets.push(
        instagramKey.startsWith("rtmp")
          ? instagramKey
          : `rtmps://live-upload.instagram.com:443/rtmp/${instagramKey}`,
      );
    }
    if (targets.length === 0) throw new Error("No RTMP targets provided");

    // Build tee output string
    const tee = targets.map((t) => `[f=flv]${t}`).join("|");

    const args = [
      "-re",
      "-i",
      videoInput,
      "-i",
      audioInput,
      ...logoInput,
      ...filterComplex,
      "-map",
      videoLabel ? videoLabel.replace(/[\[\]]/g, "") : "0:v",
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-g",
      "50",
      "-b:v",
      "2500k",
      "-maxrate",
      "3000k",
      "-bufsize",
      "5000k",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-f",
      "tee",
      tee,
    ];

    info("ffmpeg args:", args.join(" "));

    const proc = spawn(FFMPEG, args);

    proc.stdout?.on("data", (d) => info(`[ffmpeg:${sessionId}]`, d.toString()));
    proc.stderr?.on("data", (d) => info(`[ffmpeg:${sessionId}]`, d.toString()));
    proc.on("exit", (code, sig) => {
      info(`ffmpeg ${sessionId} exited code=${code} sig=${sig}`);
      this.sessions.delete(sessionId);
    });
    proc.on("error", (err) => {
      error("ffmpeg spawn error", err);
      this.sessions.delete(sessionId);
    });

    this.sessions.set(sessionId, proc);
    return { pid: proc.pid };
  }

  stop(sessionId) {
    const proc = this.sessions.get(sessionId);
    if (!proc) return false;
    proc.kill("SIGINT");
    this.sessions.delete(sessionId);
    return true;
  }
}

export const ffmpegService = new FfmpegService();
