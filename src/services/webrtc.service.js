import mediasoup from "mediasoup";
import { info, error } from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

let worker = null;
let router = null;
const transports = new Map();
const producers = new Map();
const sessions = new Map();

export function getSessionState(sessionId) {
  return sessions.get(sessionId) || null;
}

export function debugSessions() {
  return [...sessions.entries()];
}

export async function initMediasoup(io) {
  if (worker) return { worker, router };

  worker = await mediasoup.createWorker({
    rtcMinPort: 10000,
    rtcMaxPort: 20000,
    logLevel: "warn",
    logTags: ["info", "ice", "dtls", "rtp", "srtp"],
  });

  worker.on("died", () => {
    error("mediasoup worker died, exiting");
    process.exit(1);
  });

  const mediaCodecs = [
    { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
    {
      kind: "video",
      mimeType: "video/H264",
      clockRate: 90000,
      parameters: {
        "packetization-mode": 1,
        "profile-level-id": "42e01f",
      },
    },
    { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
  ];

  router = await worker.createRouter({ mediaCodecs });

  io.on("connection", (socket) => {
    info("socket connected", socket.id);

    socket.on("getRouterRtpCapabilities", (cb) => cb(router.rtpCapabilities));

    socket.on("createWebRtcTransport", async (data, callback) => {
      try {
        const transport = await router.createWebRtcTransport({
          listenIps: [
            {
              ip: "0.0.0.0",
              announcedIp: process.env.PUBLIC_IP || "127.0.0.1",
            },
          ],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          initialAvailableOutgoingBitrate: 800000,
        });

        transports.set(transport.id, transport);

        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      } catch (err) {
        console.error("createWebRtcTransport error:", err);
        callback({ error: err.toString() });
      }
    });

    socket.on(
      "connectTransport",
      async ({ transportId, dtlsParameters }, cb) => {
        try {
          const t = transports.get(transportId);
          if (!t) throw new Error("transport not found");
          await t.connect({ dtlsParameters });
          cb({ connected: true });
        } catch (err) {
          error("connectTransport", err);
          cb({ error: err.toString() });
        }
      },
    );

    socket.on(
      "produce",
      async ({ transportId, kind, rtpParameters, sessionId, appData }, cb) => {
        try {
          const t = transports.get(transportId);
          if (!t) throw new Error("transport not found for produce");

          const producer = await t.produce({ kind, rtpParameters });

          producers.set(producer.id, {
            id: producer.id,
            producer,
            kind,
            sessionId,
          });

          if (sessionId) {
            const cur = sessions.get(sessionId) || {};
            const source = appData?.source || kind;

            if (kind === "audio") cur.audio = producer.id;
            else if (source === "screen") cur.screen = producer.id;
            else cur.video = producer.id;

            sessions.set(sessionId, cur);
          }

          producer.on("transportclose", () => producers.delete(producer.id));
          producer.on("close", () => producers.delete(producer.id));

          cb({ id: producer.id });
        } catch (err) {
          error("produce err", err);
          cb({ error: err.toString() });
        }
      },
    );
  });

  info("mediasoup initialized");
  return { worker, router };
}

export async function createRtpOutputForSession(sessionId, basePort) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("No producers found for this session");

  const audioPort = basePort;
  const videoPort = basePort + 2;
  const screenPort = basePort + 4;

  let audioPayloadType = 100; // Default
  let videoPayloadType = 101; // Default
  let screenPayloadType = 102; // Default

  let videoCodecMime = "video/H264"; // Default Assumption

  // Create PlainTransports
  const audioPlain = await router.createPlainTransport({
    listenIp: "127.0.0.1",
    rtcpMux: false,
    comedia: false,
  });
  const videoPlain = await router.createPlainTransport({
    listenIp: "127.0.0.1",
    rtcpMux: false,
    comedia: false,
  });
  const screenPlain = await router.createPlainTransport({
    listenIp: "127.0.0.1",
    rtcpMux: false,
    comedia: false,
  });

  await audioPlain.connect({
    ip: "127.0.0.1",
    port: audioPort,
    rtcpPort: audioPort + 1,
  });
  await videoPlain.connect({
    ip: "127.0.0.1",
    port: videoPort,
    rtcpPort: videoPort + 1,
  });
  await screenPlain.connect({
    ip: "127.0.0.1",
    port: screenPort,
    rtcpPort: screenPort + 1,
  });

  // AUDIO
  if (s.audio) {
    const audioConsumer = await audioPlain.consume({
      producerId: s.audio,
      rtpCapabilities: router.rtpCapabilities,
      paused: false,
    });

    const opusCodec = audioConsumer.rtpParameters.codecs.find((c) =>
      c.mimeType.includes("opus"),
    );
    if (opusCodec) audioPayloadType = opusCodec.payloadType;
  }

  // VIDEO
  if (s.video) {
    const videoConsumer = await videoPlain.consume({
      producerId: s.video,
      rtpCapabilities: router.rtpCapabilities,
      paused: false,
    });

    // ✅ Detect actual codec (VP8 or H264)
    const videoCodec = videoConsumer.rtpParameters.codecs.find((c) =>
      c.mimeType.toLowerCase().startsWith("video/"),
    );

    if (videoCodec) {
      videoPayloadType = videoCodec.payloadType;
      videoCodecMime = videoCodec.mimeType; // e.g., "video/VP8"
      console.log(
        `[webrtc] Detected Video Codec: ${videoCodecMime} (PT: ${videoPayloadType})`,
      );
    }

    setInterval(() => videoConsumer.requestKeyFrame().catch(() => {}), 2000);
  }

  // SCREEN SHARE
  if (s.screen) {
    const screenConsumer = await screenPlain.consume({
      producerId: s.screen,
      rtpCapabilities: router.rtpCapabilities,
      paused: false,
    });

    const sc = screenConsumer.rtpParameters.codecs[0];
    if (sc) screenPayloadType = sc.payloadType;

    setInterval(() => screenConsumer.requestKeyFrame().catch(() => {}), 2000);
  }

  return {
    audioPort,
    videoPort,
    screenPort,
    audioPayloadType,
    videoPayloadType,
    screenPayloadType,
    videoCodecMime, // ✅ Return detected codec
    hasScreen: !!s.screen,
  };
}

export function createSessionId() {
  return uuidv4();
}

export async function stopSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;

  // Cleanup logic remains same
  sessions.delete(sessionId);
}
