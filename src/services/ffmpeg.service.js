// import { spawn } from "child_process";
// import fs from "fs";
// import path from "path";
// import { info, error } from "../utils/logger.js";
//
// const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
// const TMP_DIR = process.env.TMP_DIR;
//
// if (!TMP_DIR) {
//   throw new Error("❌ TMP_DIR is not set. Define TMP_DIR=/app/tmp in .env");
// }
//
// class FfmpegService {
//   constructor() {
//     this.sessions = new Map();
//   }
//
//   start(
//     sessionId,
//     audioPort,
//     videoPort,
//     screenPort,
//     youtubeKey,
//     facebookKey,
//     instagramKey,
//     videoPT = 101,
//     audioPT = 100,
//     screenPT = 102,
//     hasScreen = false,
//     isCameraOn = true,
//     videoCodec = "H264",
//   ) {
//     if (this.sessions.has(sessionId)) {
//       this.stop(sessionId);
//     }
//
//     if (!fs.existsSync(TMP_DIR)) {
//       fs.mkdirSync(TMP_DIR, { recursive: true });
//     }
//
//     const sdpPath = path.join(TMP_DIR, `${sessionId}.sdp`);
//     const sdpText = this.buildSDP(
//       audioPort,
//       videoPort,
//       screenPort,
//       audioPT,
//       videoPT,
//       screenPT,
//       hasScreen,
//       isCameraOn,
//       videoCodec,
//     );
//
//     fs.writeFileSync(sdpPath, sdpText);
//     info(`[ffmpeg] Wrote SDP → ${sdpPath} (Codec: ${videoCodec})`);
//
//     const filters = this.buildFilters(hasScreen, isCameraOn);
//     const outputs = this.buildOutputTargets(
//       youtubeKey,
//       facebookKey,
//       instagramKey,
//     );
//
//     const args = [
//       "-protocol_whitelist",
//       "file,udp,rtp,tcp",
//       "-fflags",
//       "+genpts+discardcorrupt",
//       "-reorder_queue_size",
//       "10000",
//       "-max_delay",
//       "5000000", // Reduced delay for faster start
//
//       "-i",
//       sdpPath,
//
//       "-filter_complex",
//       filters,
//       "-map",
//       "[v_out]",
//       "-map",
//       "0:a",
//
//       // ✅ FIX: Reset Audio Timestamps
//       "-af",
//       "asetpts=PTS-STARTPTS",
//
//       "-c:v",
//       "libx264",
//       // ✅ FIX: Force Pixel Format for YouTube
//       "-pix_fmt",
//       "yuv420p",
//
//       "-preset",
//       "ultrafast",
//       "-tune",
//       "zerolatency",
//       "-g",
//       "60", // Keyframe every 2s (assuming 30fps)
//       "-b:v",
//       "3000k",
//       "-maxrate",
//       "3500k",
//       "-bufsize",
//       "6000k",
//
//       "-c:a",
//       "aac",
//       "-b:a",
//       "128k",
//       "-ar",
//       "44100",
//
//       "-f",
//       "tee",
//       outputs,
//     ];
//
//     info("FFmpeg args:", args.join(" "));
//
//     const proc = spawn(FFMPEG, args);
//
//     proc.stderr.on("data", (data) => {
//       // Log FFmpeg output to help debugging
//       console.log(`[FFMPEG] ${data.toString().trim()}`);
//     });
//
//     proc.on("exit", (code) => {
//       try {
//         fs.unlinkSync(sdpPath);
//       } catch {}
//       this.sessions.delete(sessionId);
//       console.log(`[FFMPEG EXIT] Session ${sessionId} ended with code ${code}`);
//     });
//
//     this.sessions.set(sessionId, proc);
//
//     return { pid: proc.pid };
//   }
//
//   stop(sessionId) {
//     const proc = this.sessions.get(sessionId);
//     if (proc) {
//       proc.kill("SIGINT");
//       this.sessions.delete(sessionId);
//     }
//   }
//
//   buildSDP(
//     audioPort,
//     videoPort,
//     screenPort,
//     audioPT,
//     videoPT,
//     screenPT,
//     hasScreen,
//     isCameraOn,
//     videoCodec,
//   ) {
//     let sdp = `v=0
// o=- 0 0 IN IP4 127.0.0.1
// s=Mediasoup RTP
// c=IN IP4 127.0.0.1
// t=0 0
// m=audio ${audioPort} RTP/AVP ${audioPT}
// a=rtpmap:${audioPT} opus/48000/2
// a=fmtp:${audioPT} sprop-stereo=1\n`;
//
//     if (isCameraOn) {
//       sdp += `\nm=video ${videoPort} RTP/AVP ${videoPT}`;
//       sdp += `\na=rtpmap:${videoPT} ${videoCodec}/90000`;
//       if (videoCodec.toUpperCase() === "H264") {
//         sdp += `\na=fmtp:${videoPT} packetization-mode=1;profile-level-id=42e01f`;
//       }
//     }
//
//     if (hasScreen) {
//       sdp += `\nm=video ${screenPort} RTP/AVP ${screenPT}`;
//       sdp += `\na=rtpmap:${screenPT} H264/90000`; // Assuming H264 for screen
//       sdp += `\na=fmtp:${screenPT} packetization-mode=1;profile-level-id=42e01f`;
//     }
//
//     return sdp.trim();
//   }
//
//   buildFilters(hasScreen, isCameraOn) {
//     const title = path.join(TMP_DIR, "title.txt");
//     const banner = path.join(TMP_DIR, "banner.txt");
//     const ticker = path.join(TMP_DIR, "ticker.txt");
//
//     // Ensure text files exist to prevent FFmpeg crash
//     if (!fs.existsSync(title)) fs.writeFileSync(title, " ");
//     if (!fs.existsSync(banner)) fs.writeFileSync(banner, " ");
//     if (!fs.existsSync(ticker)) fs.writeFileSync(ticker, " ");
//
//     let videoBase = isCameraOn ? "[0:v:0]" : null;
//
//     // Fallback if camera is off
//     const placeholder =
//       "color=c=black:s=1280x720:d=10 [ph]; [ph] drawtext=text='Stream Starting':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2 [placeholder]";
//
//     const filters = [];
//
//     if (!isCameraOn) {
//       filters.push(placeholder);
//       videoBase = "[placeholder]";
//     } else {
//       // ✅ FIX: Timestamp Reset for Camera
//       filters.push(
//         `${videoBase} setpts=PTS-STARTPTS, transpose=1 [cam_rotated]`,
//       );
//       videoBase = "[cam_rotated]";
//     }
//
//     if (hasScreen) {
//       // Detect screen input index
//       const screenIdx = isCameraOn ? "[0:v:1]" : "[0:v:0]";
//
//       // ✅ FIX: Timestamp Reset for Screen
//       filters.push(`${screenIdx} setpts=PTS-STARTPTS [screen_reset]`);
//
//       filters.push(
//         `[screen_reset] scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720 [bg]`,
//       );
//       filters.push(`${videoBase} scale=300:533 [cam_small]`);
//       filters.push(`[bg][cam_small] overlay=W-w-20:H-h-20 [layout]`);
//       videoBase = "[layout]";
//     } else {
//       filters.push(
//         `${videoBase} scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720 [scaled]`,
//       );
//       videoBase = "[scaled]";
//     }
//
//     // Overlays
//     filters.push(
//       `${videoBase} drawtext=textfile='${title}':reload=1:fontsize=36:fontcolor=white:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=h-120 [t0]`,
//     );
//     filters.push(
//       `[t0] drawtext=textfile='${banner}':reload=1:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.4:x=10:y=10 [t1]`,
//     );
//     filters.push(
//       `[t1] drawtext=textfile='${ticker}':reload=1:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.4:x=w-mod((t)*100\\,w+tw):y=h-50 [t2]`,
//     );
//
//     // ✅ FIX: Final format enforcement
//     filters.push(`[t2] format=yuv420p [v_out]`);
//
//     return filters.join(";");
//   }
//
//   buildOutputTargets(yKey, fbKey, igKey) {
//     const outputs = [];
//     if (yKey)
//       outputs.push(
//         yKey.startsWith("rtmp")
//           ? yKey
//           : `rtmp://a.rtmp.youtube.com/live2/${yKey}`,
//       );
//     if (fbKey)
//       outputs.push(
//         fbKey.startsWith("rtmp")
//           ? fbKey
//           : `rtmps://live-api-s.facebook.com:443/rtmp/${fbKey}`,
//       );
//     if (igKey)
//       outputs.push(
//         igKey.startsWith("rtmp")
//           ? igKey
//           : `rtmps://live-upload.instagram.com:443/rtmp/${igKey}`,
//       );
//
//     if (outputs.length === 0)
//       throw new Error("❌ No streaming targets provided");
//
//     // Using basic flv flags to prevent duration waiting
//     return outputs
//       .map((o) => `[f=flv:flvflags=no_duration_filesize]${o}`)
//       .join("|");
//   }
// }
//
// export const ffmpegService = new FfmpegService();

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
    streamFormat = "landscape",
    logoPath = null,
  ) {
    if (this.sessions.has(sessionId)) {
      this.stop(sessionId);
    }

    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }

    // --- FIX 1: Ensure Overlays have Default Content ---
    this.initializeOverlayFiles();

    // 1. Create SDP
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
      streamFormat,
    );

    fs.writeFileSync(sdpPath, sdpText);

    // 2. Build Filters
    const filters = this.buildFilters(
      hasScreen,
      isCameraOn,
      streamFormat,
      logoPath,
    );

    // 3. Build Targets
    const outputs = this.buildOutputTargets(
      youtubeKey,
      facebookKey,
      instagramKey,
    );

    const isPortrait = streamFormat === "portrait";

    // Bitrate settings optimized for mobile streaming
    const bitrate = isPortrait ? "3000k" : "4500k";
    const maxrate = isPortrait ? "3500k" : "5500k";
    const bufsize = isPortrait ? "6000k" : "9000k";

    const args = [
      "-y",
      "-protocol_whitelist",
      "file,udp,rtp,tcp",
      "-thread_queue_size",
      "4096",

      "-i",
      sdpPath,

      "-filter_complex",
      filters,

      "-map",
      "[v_out]",
      "-map",
      "0:a?", // Map audio if present

      // Audio Sync
      "-af",
      "aresample=async=1:first_pts=0",

      // Video Encoding
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-tune",
      "zerolatency",
      "-g",
      "60", // 2 second keyframe interval
      "-r",
      "30",
      "-b:v",
      bitrate,
      "-maxrate",
      maxrate,
      "-bufsize",
      bufsize,
      "-profile:v",
      "high",

      // Audio Encoding
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",

      "-f",
      "tee",
      outputs,
    ];

    info("FFmpeg args:", args.join(" "));

    const proc = spawn(FFMPEG, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stderr.on("data", (data) => {
      const msg = data.toString();
      if (msg.includes("Error") || msg.includes("frame=")) {
        console.log(`[FFMPEG] ${msg.trim()}`);
      }
    });

    proc.on("exit", (code) => {
      try {
        if (fs.existsSync(sdpPath)) fs.unlinkSync(sdpPath);
      } catch {}
      this.sessions.delete(sessionId);
      console.log(`[FFMPEG EXIT] Session ${sessionId} ended - Code: ${code}`);
    });

    this.sessions.set(sessionId, proc);
    return { pid: proc.pid };
  }

  stop(sessionId) {
    const proc = this.sessions.get(sessionId);
    if (proc) {
      proc.kill("SIGKILL");
      this.sessions.delete(sessionId);
    }
  }

  initializeOverlayFiles() {
    const defaults = {
      "title.txt": "LIVE STREAM",
      "banner.txt": "Welcome to JantaWave",
      "ticker.txt": " • Live updates • Keeping you connected • ",
      "viewers.txt": "0",
    };

    for (const [file, text] of Object.entries(defaults)) {
      const filePath = path.join(TMP_DIR, file);
      // If file doesn't exist OR is empty, write default
      if (!fs.existsSync(filePath) || fs.readFileSync(filePath).length === 0) {
        fs.writeFileSync(filePath, text);
      }
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
    streamFormat,
  ) {
    let sdp = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=JantaWave Stream
c=IN IP4 127.0.0.1
t=0 0
a=tool:mediasoup
m=audio ${audioPort} RTP/AVP ${audioPT}
a=rtpmap:${audioPT} opus/48000/2
a=fmtp:${audioPT} sprop-stereo=1;useinbandfec=1
a=rtcp-mux\n`;

    if (isCameraOn) {
      sdp += `m=video ${videoPort} RTP/AVP ${videoPT}\n`;
      sdp += `a=rtpmap:${videoPT} ${videoCodec}/90000\n`;
      if (videoCodec.toUpperCase() === "H264") {
        sdp += `a=fmtp:${videoPT} packetization-mode=1;profile-level-id=42e01f\n`;
      } else if (videoCodec.toUpperCase() === "VP8") {
        sdp += `a=fmtp:${videoPT} max-fr=30;max-fs=3600\n`;
      }
      sdp += `a=rtcp-mux\n`;
    }

    if (hasScreen) {
      sdp += `m=video ${screenPort} RTP/AVP ${screenPT}\n`;
      sdp += `a=rtpmap:${screenPT} ${videoCodec}/90000\n`;
      if (videoCodec.toUpperCase() === "H264") {
        sdp += `a=fmtp:${screenPT} packetization-mode=1;profile-level-id=42e01f\n`;
      }
      sdp += `a=rtcp-mux\n`;
    }
    return sdp.trim();
  }

  buildOutputTargets(yKey, fbKey, igKey) {
    const outputs = [];
    const flags = "[f=flv:onfail=ignore]";

    if (yKey)
      outputs.push(
        `${flags}${yKey.startsWith("rtmp") ? yKey : `rtmp://a.rtmp.youtube.com/live2/${yKey}`}`,
      );
    if (fbKey)
      outputs.push(
        `${flags}${fbKey.startsWith("rtmp") ? fbKey : `rtmps://live-api-s.facebook.com:443/rtmp/${fbKey}`}`,
      );
    if (igKey)
      outputs.push(
        `${flags}${igKey.startsWith("rtmp") ? igKey : `rtmps://live-upload.instagram.com:443/rtmp/${igKey}`}`,
      );

    if (outputs.length === 0) throw new Error("No streaming targets provided");
    return outputs.join("|");
  }

  buildFilters(
    hasScreen,
    isCameraOn,
    streamFormat = "landscape",
    logoPath = null,
  ) {
    const title = path.join(TMP_DIR, "title.txt");
    const banner = path.join(TMP_DIR, "banner.txt");
    const ticker = path.join(TMP_DIR, "ticker.txt");

    const isPortrait = streamFormat === "portrait";
    const { width, height } = isPortrait
      ? { width: 1080, height: 1920 }
      : { width: 1920, height: 1080 };

    let videoBase = null;
    const filters = [];

    // --- FIX 2: Correct Scaling to Fill Screen (No Black Bars) ---
    // We use force_original_aspect_ratio=increase combined with crop.
    // This zooms the image until it covers the whole canvas, cutting off excess edges.

    if (!isCameraOn) {
      filters.push(`color=c=#0f0f23:s=${width}x${height} [ph_bg]`);
      filters.push(
        `[ph_bg] drawtext=text='📹':fontsize=100:fontcolor=#00d4ff:x=(w-text_w)/2:y=(h-text_h)/2-80 [ph1]`,
      );
      filters.push(
        `[ph1] drawtext=text='Stream Starting...':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2+50 [placeholder]`,
      );
      videoBase = "[placeholder]";
    } else {
      // Camera is stream 0:v:0
      // Scale logic: Scale up until one dimension fits, then crop the rest to exact WxH
      filters.push(
        `[0:v:0] setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height} [cam_full]`,
      );
      videoBase = "[cam_full]";
    }

    // --- Screen Share Layer ---
    if (hasScreen) {
      const screenIdx = isCameraOn ? "[0:v:1]" : "[0:v:0]";
      // Screen share should FIT inside (windowbox ok here to see full text), with black bg
      filters.push(
        `${screenIdx} setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black [screen_bg]`,
      );

      // PIP Camera
      if (isCameraOn) {
        const pipW = isPortrait ? 280 : 380;
        // PIP also needs to fill its small box
        filters.push(`${videoBase} scale=${pipW}:-1 [cam_pip]`);
        filters.push(
          `[cam_pip] drawbox=x=0:y=0:w=iw:h=ih:color=white@0.5:t=4 [cam_bordered]`,
        );

        const xPos = isPortrait ? "W-w-24" : "W-w-30";
        const yPos = isPortrait ? "40" : "H-h-30";

        filters.push(
          `[screen_bg][cam_bordered] overlay=${xPos}:${yPos} [layout]`,
        );
        videoBase = "[layout]";
      } else {
        videoBase = "[screen_bg]";
      }
    }

    // --- FONT CONFIG ---
    // Ensure this font exists, or remove fontfile=... parameter
    const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const fontCmd = fs.existsSync(font) ? `:fontfile=${font}` : "";

    // --- FIX 3: Logo Top-Right & Live Top-Left ---

    // 1. LIVE Badge (Top Left)
    if (isPortrait) {
      filters.push(`color=c=#ff0000@0.85:s=140x60 [live_bg]`);
      filters.push(`${videoBase}[live_bg] overlay=24:40 [v1]`);
      filters.push(
        `[v1] drawtext=text='● LIVE':fontsize=26:fontcolor=white:x=38:y=55${fontCmd} [v2]`,
      );
    } else {
      filters.push(`color=c=#ff0000@0.85:s=150x70 [live_bg]`);
      filters.push(`${videoBase}[live_bg] overlay=40:40 [v1]`);
      filters.push(
        `[v1] drawtext=text='● LIVE':fontsize=30:fontcolor=white:x=58:y=60${fontCmd} [v2]`,
      );
    }

    videoBase = "[v2]";

    // 2. Logo (Top Right - replacing View Count)
    if (logoPath && fs.existsSync(logoPath)) {
      const logoSize = isPortrait ? 120 : 150;
      // Padding from edges
      const padding = isPortrait ? 24 : 40;
      // Top alignment (same as Live badge y)
      const topY = isPortrait ? 40 : 40;

      filters.push(`movie='${logoPath}',scale=${logoSize}:-1 [logo]`);
      // Calculate X to put it on the right side: Width - LogoWidth - Padding
      filters.push(`${videoBase}[logo] overlay=W-w-${padding}:${topY} [v3]`);
      videoBase = "[v3]";
    }

    // 3. Bottom Overlays (Title/Ticker)
    if (isPortrait) {
      filters.push(`color=c=black@0.6:s=${width}x250 [bottom_dim]`);
      filters.push(`${videoBase}[bottom_dim] overlay=0:H-250 [v4]`);

      filters.push(
        `[v4] drawtext=textfile='${title}':reload=1:fontsize=42:fontcolor=white:x=40:y=h-200${fontCmd} [v5]`,
      );
      filters.push(
        `[v5] drawtext=textfile='${banner}':reload=1:fontsize=28:fontcolor=yellow:x=40:y=h-140${fontCmd} [v6]`,
      );

      filters.push(`color=c=#000088@0.9:s=${width}x60 [ticker_bg]`);
      filters.push(`[v6][ticker_bg] overlay=0:H-60 [v7]`);
      filters.push(
        `[v7] drawtext=textfile='${ticker}':reload=1:fontsize=32:fontcolor=white:y=h-45:x=w-mod(t*100\\,w+tw)${fontCmd} [v_final]`,
      );
    } else {
      filters.push(`color=c=black@0.5:s=${width}x140 [bottom_dim]`);
      filters.push(`${videoBase}[bottom_dim] overlay=0:H-140 [v4]`);

      filters.push(
        `[v4] drawtext=textfile='${title}':reload=1:fontsize=44:fontcolor=white:x=50:y=h-100${fontCmd} [v5]`,
      );

      filters.push(`color=c=#000088@0.9:s=${width}x50 [ticker_bg]`);
      filters.push(`[v5][ticker_bg] overlay=0:H-50 [v6]`);
      filters.push(
        `[v6] drawtext=textfile='${ticker}':reload=1:fontsize=30:fontcolor=white:y=h-38:x=w-mod(t*150\\,w+tw)${fontCmd} [v_final]`,
      );
    }

    filters.push(`[v_final] format=yuv420p [v_out]`);

    return filters.join("; ");
  }
}

export const ffmpegService = new FfmpegService();
