import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { info, error } from "../utils/logger.js";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const TMP_DIR = process.env.TMP_DIR;

if (!TMP_DIR) {
  throw new Error("❌ TMP_DIR is not set. Define TMP_DIR=/app/tmp in .env");
}

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
    videoPT = 101,
    audioPT = 100,
    screenPT = 102,
    hasScreen = false,
    isCameraOn = true,
    videoCodec = "H264",
  ) {
    if (this.sessions.has(sessionId)) {
      this.stop(sessionId);
    }

    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }

    const sdpPath = path.join(TMP_DIR, `${sessionId}.sdp`);
    const sdpText = this.buildSDP(
      audioPort,
      videoPort,
      screenPort,
      audioPT,
      videoPT,
      screenPT,
      hasScreen,
      isCameraOn,
      videoCodec,
    );

    fs.writeFileSync(sdpPath, sdpText);
    info(`[ffmpeg] Wrote SDP → ${sdpPath} (Codec: ${videoCodec})`);

    const filters = this.buildFilters(hasScreen, isCameraOn);
    const outputs = this.buildOutputTargets(
      youtubeKey,
      facebookKey,
      instagramKey,
    );

    const args = [
      "-protocol_whitelist",
      "file,udp,rtp,tcp",
      "-fflags",
      "+genpts+discardcorrupt",
      "-reorder_queue_size",
      "10000",
      "-max_delay",
      "5000000", // Reduced delay for faster start

      "-i",
      sdpPath,

      "-filter_complex",
      filters,
      "-map",
      "[v_out]",
      "-map",
      "0:a",

      // ✅ FIX: Reset Audio Timestamps
      "-af",
      "asetpts=PTS-STARTPTS",

      "-c:v",
      "libx264",
      // ✅ FIX: Force Pixel Format for YouTube
      "-pix_fmt",
      "yuv420p",

      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-g",
      "60", // Keyframe every 2s (assuming 30fps)
      "-b:v",
      "3000k",
      "-maxrate",
      "3500k",
      "-bufsize",
      "6000k",

      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",

      "-f",
      "tee",
      outputs,
    ];

    info("FFmpeg args:", args.join(" "));

    const proc = spawn(FFMPEG, args);

    proc.stderr.on("data", (data) => {
      // Log FFmpeg output to help debugging
      console.log(`[FFMPEG] ${data.toString().trim()}`);
    });

    proc.on("exit", (code) => {
      try {
        fs.unlinkSync(sdpPath);
      } catch {}
      this.sessions.delete(sessionId);
      console.log(`[FFMPEG EXIT] Session ${sessionId} ended with code ${code}`);
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

  buildSDP(
    audioPort,
    videoPort,
    screenPort,
    audioPT,
    videoPT,
    screenPT,
    hasScreen,
    isCameraOn,
    videoCodec,
  ) {
    let sdp = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=Mediasoup RTP
c=IN IP4 127.0.0.1
t=0 0
m=audio ${audioPort} RTP/AVP ${audioPT}
a=rtpmap:${audioPT} opus/48000/2
a=fmtp:${audioPT} sprop-stereo=1\n`;

    if (isCameraOn) {
      sdp += `\nm=video ${videoPort} RTP/AVP ${videoPT}`;
      sdp += `\na=rtpmap:${videoPT} ${videoCodec}/90000`;
      if (videoCodec.toUpperCase() === "H264") {
        sdp += `\na=fmtp:${videoPT} packetization-mode=1;profile-level-id=42e01f`;
      }
    }

    if (hasScreen) {
      sdp += `\nm=video ${screenPort} RTP/AVP ${screenPT}`;
      sdp += `\na=rtpmap:${screenPT} H264/90000`; // Assuming H264 for screen
      sdp += `\na=fmtp:${screenPT} packetization-mode=1;profile-level-id=42e01f`;
    }

    return sdp.trim();
  }

  buildFilters(hasScreen, isCameraOn) {
    const title = path.join(TMP_DIR, "title.txt");
    const banner = path.join(TMP_DIR, "banner.txt");
    const ticker = path.join(TMP_DIR, "ticker.txt");

    // Ensure text files exist to prevent FFmpeg crash
    if (!fs.existsSync(title)) fs.writeFileSync(title, " ");
    if (!fs.existsSync(banner)) fs.writeFileSync(banner, " ");
    if (!fs.existsSync(ticker)) fs.writeFileSync(ticker, " ");

    let videoBase = isCameraOn ? "[0:v:0]" : null;

    // Fallback if camera is off
    const placeholder =
      "color=c=black:s=1280x720:d=10 [ph]; [ph] drawtext=text='Stream Starting':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2 [placeholder]";

    const filters = [];

    if (!isCameraOn) {
      filters.push(placeholder);
      videoBase = "[placeholder]";
    } else {
      // ✅ FIX: Timestamp Reset for Camera
      filters.push(
        `${videoBase} setpts=PTS-STARTPTS, transpose=1 [cam_rotated]`,
      );
      videoBase = "[cam_rotated]";
    }

    if (hasScreen) {
      // Detect screen input index
      const screenIdx = isCameraOn ? "[0:v:1]" : "[0:v:0]";

      // ✅ FIX: Timestamp Reset for Screen
      filters.push(`${screenIdx} setpts=PTS-STARTPTS [screen_reset]`);

      filters.push(
        `[screen_reset] scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720 [bg]`,
      );
      filters.push(`${videoBase} scale=300:533 [cam_small]`);
      filters.push(`[bg][cam_small] overlay=W-w-20:H-h-20 [layout]`);
      videoBase = "[layout]";
    } else {
      filters.push(
        `${videoBase} scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720 [scaled]`,
      );
      videoBase = "[scaled]";
    }

    // Overlays
    filters.push(
      `${videoBase} drawtext=textfile='${title}':reload=1:fontsize=36:fontcolor=white:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=h-120 [t0]`,
    );
    filters.push(
      `[t0] drawtext=textfile='${banner}':reload=1:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.4:x=10:y=10 [t1]`,
    );
    filters.push(
      `[t1] drawtext=textfile='${ticker}':reload=1:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.4:x=w-mod((t)*100\\,w+tw):y=h-50 [t2]`,
    );

    // ✅ FIX: Final format enforcement
    filters.push(`[t2] format=yuv420p [v_out]`);

    return filters.join(";");
  }

  buildOutputTargets(yKey, fbKey, igKey) {
    const outputs = [];
    if (yKey)
      outputs.push(
        yKey.startsWith("rtmp")
          ? yKey
          : `rtmp://a.rtmp.youtube.com/live2/${yKey}`,
      );
    if (fbKey)
      outputs.push(
        fbKey.startsWith("rtmp")
          ? fbKey
          : `rtmps://live-api-s.facebook.com:443/rtmp/${fbKey}`,
      );
    if (igKey)
      outputs.push(
        igKey.startsWith("rtmp")
          ? igKey
          : `rtmps://live-upload.instagram.com:443/rtmp/${igKey}`,
      );

    if (outputs.length === 0)
      throw new Error("❌ No streaming targets provided");

    // Using basic flv flags to prevent duration waiting
    return outputs
      .map((o) => `[f=flv:flvflags=no_duration_filesize]${o}`)
      .join("|");
  }
}

export const ffmpegService = new FfmpegService();
