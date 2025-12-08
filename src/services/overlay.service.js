// src/services/overlay.service.js
import fs from "fs";
import path from "path";
import os from "os";
import { info } from "../utils/logger.js";

const OVERLAY_FILE = path.resolve(process.cwd(), "overlays.json");

// 🔥 Use OS-provided temp directory (always writable)
const TMP_DIR = os.tmpdir();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

class OverlayService {
  constructor() {
    this.state = {
      title: "Live Stream",
      bannerText: "Welcome",
      ticker: "Live Now",
      logoUrl: "",
    };

    // Load persistent overlay config
    if (fs.existsSync(OVERLAY_FILE)) {
      try {
        this.state = {
          ...this.state,
          ...JSON.parse(fs.readFileSync(OVERLAY_FILE, "utf8")),
        };
      } catch (e) {
        console.error("Failed to read overlays.json:", e);
      }
    }

    ensureDir(TMP_DIR);
    this.syncFiles();
  }

  get() {
    return this.state;
  }

  update(updates) {
    this.state = { ...this.state, ...(updates || {}) };
    this.persist();
    this.syncFiles();
  }

  persist() {
    fs.writeFileSync(OVERLAY_FILE, JSON.stringify(this.state, null, 2), "utf8");
  }

  // Write overlay texts to temp files for FFmpeg
  syncFiles() {
    try {
      fs.writeFileSync(path.join(TMP_DIR, "title.txt"), this.state.title || "");
      fs.writeFileSync(
        path.join(TMP_DIR, "banner.txt"),
        this.state.bannerText || "",
      );
      fs.writeFileSync(
        path.join(TMP_DIR, "ticker.txt"),
        this.state.ticker || "",
      );

      info(`overlay: synced text files to ${TMP_DIR}`);
    } catch (e) {
      console.error("Failed to write overlay text files:", e);
    }
  }
}

export const overlayService = new OverlayService();
