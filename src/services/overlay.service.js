// src/services/overlay.service.js
import fs from "fs";
import path from "path";
import { info } from "../utils/logger.js";

const OVERLAY_FILE = path.resolve(process.cwd(), "overlays.json");
const TMP_DIR = "/tmp"; // Ensure this exists and is writable

class OverlayService {
  constructor() {
    this.state = {
      title: "Live Stream",
      bannerText: "Welcome",
      ticker: "Live Now",
      logoUrl: "",
    };

    if (fs.existsSync(OVERLAY_FILE)) {
      try {
        this.state = {
          ...this.state,
          ...JSON.parse(fs.readFileSync(OVERLAY_FILE, "utf8")),
        };
      } catch (e) {}
    }
    this.syncFiles();
  }

  get() {
    return this.state;
  }

  update(updates) {
    this.state = { ...this.state, ...(updates || {}) };
    this.persist();
    this.syncFiles(); // ✅ Update the text files for FFmpeg
  }

  persist() {
    fs.writeFileSync(OVERLAY_FILE, JSON.stringify(this.state, null, 2), "utf8");
  }

  // ✅ Write text content to files for FFmpeg's 'textfile' option
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
      info("overlay: synced text files");
    } catch (e) {
      console.error("Failed to write overlay text files:", e);
    }
  }
}

export const overlayService = new OverlayService();
