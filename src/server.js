// src/server.js
import { app } from "./app.js";
import dotenv from "dotenv";
dotenv.config();
import { createServer } from "http";
import { createSocket } from "./socket.js";
import { initMediasoup } from "./services/webrtc.service.js";
import { info } from "./utils/logger.js";

const PORT = parseInt(process.env.PORT || "8000", 10);
const HOSTNAME = "0.0.0.0";

const server = createServer(app);
const io = createSocket(server);

// make io available to express via app.set
app.set("io", io);

// init mediasoup worker and router
(async () => {
  await initMediasoup(io);
})().catch((err) => {
  console.error("mediasoup init failed", err);
  process.exit(1);
});

server.listen(PORT, HOSTNAME, () => {
  info(`Server running on port ${HOSTNAME}:${PORT}`);
});
