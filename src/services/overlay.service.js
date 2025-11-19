// src/services/overlay.service.js
import fs from "fs";
import path from "path";
import { info } from "../utils/logger.js";

const FILE = path.resolve(process.cwd(), "overlays.json");

class OverlayService {
  constructor() {
    this.state = {};
    if (fs.existsSync(FILE)) {
      try {
        this.state = JSON.parse(fs.readFileSync(FILE, "utf8"));
      } catch (e) {
        info("overlay: parse error, starting empty");
        this.state = {};
      }
    }
    this.persist();
  }

  get() {
    return this.state;
  }

  update(updates) {
    this.state = { ...this.state, ...(updates || {}) };
    this.persist();
  }

  persist() {
    fs.writeFileSync(FILE, JSON.stringify(this.state, null, 2), "utf8");
    info("overlay: saved overlays.json");
  }
}

export const overlayService = new OverlayService();
