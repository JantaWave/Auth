// src/services/overlay.service.js
import fs from "fs";
import path from "path";
import { info } from "../utils/logger.js";

const OVERLAY_FILE = path.resolve(process.cwd(), "overlays.json");

// TMP_DIR must be explicitly set in .env or docker-compose
const TMP_DIR = process.env.TMP_DIR;
if (!TMP_DIR) {
  throw new Error(
    "❌ TMP_DIR is not set! Please define TMP_DIR=/app/tmp in .env",
  );
}

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

    // Load overlay.json if exists
    if (fs.existsSync(OVERLAY_FILE)) {
      try {
        const file = fs.readFileSync(OVERLAY_FILE, "utf8");
        this.state = { ...this.state, ...JSON.parse(file) };
      } catch (err) {
        console.error("Failed to read overlays.json:", err);
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

  syncFiles() {
    try {
      fs.writeFileSync(path.join(TMP_DIR, "title.txt"), this.state.title);
      fs.writeFileSync(path.join(TMP_DIR, "banner.txt"), this.state.bannerText);
      fs.writeFileSync(path.join(TMP_DIR, "ticker.txt"), this.state.ticker);

      info(`overlay: synced text files into ${TMP_DIR}`);
    } catch (err) {
      console.error("Failed to write overlay temp files:", err);
    }
  }
}

export const overlayService = new OverlayService();
