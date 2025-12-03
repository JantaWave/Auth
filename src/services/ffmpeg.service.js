// src/services/ffmpeg.service.js
import { spawn } from "child_process";
import fs from "fs";
import { info, error } from "../utils/logger.js";
import { overlayService } from "./overlay.service.js";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

class FfmpegService {
  constructor() {
    this.sessions = new Map();
  }

  start(
    sessionId,
    audioPort,
    videoPort,
    screenPort,
    youtubeKey,
    facebookKey,
    instagramKey,
    videoPayloadType = 101,
    audioPayloadType = 100,
    screenPayloadType = 101,
    hasScreen,
    isCameraOn = true,
  ) {
    if (this.sessions.has(sessionId)) {
      console.log(
        `[ffmpeg] Stopping existing session ${sessionId} before restart.`,
      );
      this.stop(sessionId);
    }

    const overlays = overlayService.get(); // Initial load

    // 1. Generate SDP (Same as before)
    let sdpString = `v=0\no=- 0 0 IN IP4 127.0.0.1\ns=FFmpeg\nc=IN IP4 127.0.0.1\nt=0 0\n`;
    sdpString += `m=audio ${audioPort} RTP/AVP ${audioPayloadType}\na=rtpmap:${audioPayloadType} opus/48000/2\n`;

    if (isCameraOn) {
      sdpString += `m=video ${videoPort} RTP/AVP ${videoPayloadType}\na=rtpmap:${videoPayloadType} H264/90000\n`;
    }
    if (hasScreen) {
      sdpString += `m=video ${screenPort} RTP/AVP ${screenPayloadType}\na=rtpmap:${screenPayloadType} H264/90000\n`;
    }
    const placeholderText =
      "Host will join soon.\nSorry for any inconvenience.";
    const placeholderFilter = `color=c=black:s=1280x720:r=30 [placeholder_bg]; [placeholder_bg] drawtext=text='${placeholderText}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.6 [placeholder_v]`;

    const sdpPath = `/tmp/${sessionId}.sdp`;
    fs.writeFileSync(sdpPath, sdpString);
    info(`[ffmpeg] Wrote SDP to ${sdpPath}`);

    // 2. Build Filters
    const filters = [];

    // --- INPUT HANDLING ---
    let camSource = isCameraOn ? "[0:v:0]" : "[placeholder_v]";
    let screenSource = null;

    // Determine Input Mapping based on SDP structure
    if (isCameraOn && hasScreen) {
      screenSource = "[0:v:1]";
    } else if (!isCameraOn && hasScreen) {
      screenSource = "[0:v:0]";
      camSource = "color_src";
    } // Placeholder
    else if (!isCameraOn && !hasScreen) {
      camSource = "color_src";
    }

    // If Camera is OFF, generate placeholder
    if (!isCameraOn) {
      filters.push(placeholderFilter); // Portrait placeholder
      if (!hasScreen) {
        // Add text to placeholder
        filters.push(
          `[color_src] drawtext=text='Camera Off':fontcolor=white:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2 [cam_base]`,
        );
        camSource = "[cam_base]";
      }
    } else {
      filters.push(`${camSource} transpose=1 [cam_rotated]`);
      camSource = "[cam_rotated]";
    }

    let currentLabel = camSource;

    // --- LAYOUT LOGIC ---
    if (hasScreen) {
      // PiP: Screen (BG) + Camera (Overlay)
      // Screen is usually Landscape, Camera is Portrait (after rotation)
      filters.push(
        `${screenSource} scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2 [bg]`,
      );
      filters.push(`${camSource} scale=240:426 [cam_small]`); // Scaled Portrait
      filters.push(`[bg][cam_small] overlay=W-w-20:H-h-20 [pip]`);
      currentLabel = "[pip]";
    } else {
      // Fullscreen Camera
      // Force 720p Landscape container for YouTube
      filters.push(
        `${camSource} scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2 [v_scaled]`,
      );
      currentLabel = "[v_scaled]";
    }

    // --- DYNAMIC OVERLAYS ---
    // ✅ FIX 2: Use 'textfile' and 'reload=1' for live updates

    if (overlays.logoUrl) {
      // Assuming Logo is Input 1 (if exists)
      filters.push(
        `${currentLabel}[1:v] overlay=main_w-overlay_w-10:10:format=auto [v_logo]`,
      );
      currentLabel = "[v_logo]";
    }

    // Title
    filters.push(
      `${currentLabel} drawtext=textfile='/tmp/title.txt':reload=1:fontcolor=white:fontsize=36:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=h-120 [v_title]`,
    );
    currentLabel = "[v_title]";

    // Banner
    filters.push(
      `${currentLabel} drawtext=textfile='/tmp/banner.txt':reload=1:fontcolor=white:fontsize=28:box=1:boxcolor=black@0.4:x=10:y=10 [v_banner]`,
    );
    currentLabel = "[v_banner]";

    // ✅ FIX 3: Live Timer (pts:hms)
    // Ticker + Timer combined
    filters.push(
      `${currentLabel} drawtext=textfile='/tmp/ticker.txt':reload=1:fontcolor=white:fontsize=22:x=w-mod(max(t\\,0)*100\\,w+tw):y=h-50:box=1:boxcolor=black@0.4 [v_ticker]`,
    );
    // Add Timer Top-Right
    filters.push(
      `[v_ticker] drawtext=text='%{pts\\:hms}':fontcolor=red:fontsize=24:x=w-text_w-20:y=20:box=1:boxcolor=black@0.6 [v_out]`,
    );

    // Targets
    const targets = [];
    if (youtubeKey)
      targets.push(
        youtubeKey.startsWith("rtmp")
          ? youtubeKey
          : `rtmp://a.rtmp.youtube.com/live2/${youtubeKey}`,
      );
    if (facebookKey)
      targets.push(
        facebookKey.startsWith("rtmp")
          ? facebookKey
          : `rtmps://live-api-s.facebook.com:443/rtmp/${facebookKey}`,
      );
    if (instagramKey)
      targets.push(
        instagramKey.startsWith("rtmp")
          ? instagramKey
          : `rtmps://live-upload.instagram.com:443/rtmp/${instagramKey}`,
      );
    if (targets.length === 0) throw new Error("No targets");

    const tee = targets.map((t) => `[f=flv]${t}`).join("|");
    const logoInput = overlays.logoUrl ? ["-i", overlays.logoUrl] : [];

    // ✅ FIX 4: Stability Settings (Lower bitrate, high buffers)
    const args = [
      "-protocol_whitelist",
      "file,udp,rtp",
      "-reorder_queue_size",
      "10000",
      "-max_delay",
      "10000000",
      "-buffer_size",
      "20000000",
      "-analyzeduration",
      "500M",
      "-probesize",
      "500M",
      "-fflags",
      "+genpts+discardcorrupt",

      "-i",
      sdpPath,
      ...logoInput,

      "-filter_complex",
      filters.join(";"),
      "-map",
      "[v_out]",
      "-map",
      "0:a",

      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-g",
      "60",
      "-b:v",
      "800k", // ✅ Reduced Bitrate for stability
      "-maxrate",
      "1000k",
      "-bufsize",
      "2000k",
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
    // ... (standard proc events) ...

    proc.on("exit", () => {
      try {
        fs.unlinkSync(sdpPath);
      } catch (e) {}
      this.sessions.delete(sessionId);
    });
    this.sessions.set(sessionId, proc);
    return { pid: proc.pid };
  }

  stop(sessionId) {
    const proc = this.sessions.get(sessionId);
    if (proc) {
      proc.kill("SIGINT");
      this.sessions.delete(sessionId);
    }
  }
}

export const ffmpegService = new FfmpegService();
