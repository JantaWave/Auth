// src/services/webrtc.service.js
import mediasoup from "mediasoup";
import { info, error } from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

let worker = null;
let router = null;

// store transports by id
const transports = new Map();
// store producers by id
const producers = new Map();
// sessions map: sessionId -> { audio, video, screen }
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
      parameters: { "packetization-mode": 1 },
    },
    { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
  ];

  router = await worker.createRouter({ mediaCodecs });

  // socket.io handlers
  io.on("connection", (socket) => {
    info("socket connected", socket.id);

    socket.on("getRouterRtpCapabilities", (cb) => {
      cb(router.rtpCapabilities);
    });

    socket.on("createWebRtcTransport", async (data, cb) => {
      try {
        const transport = await router.createWebRtcTransport({
          listenIps: [
            {
              ip: process.env.MEDIASOUP_LISTEN_IP || "127.0.0.1",
              announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
            },
          ],
          enableUdp: true,
          enableTcp: true,
          preferUdp: false, // ✅ TCP Preferred for stability
        });

        transports.set(transport.id, transport);
        transport.on("dtlsstatechange", (dtlsState) => {
          if (dtlsState === "closed") transports.delete(transport.id);
        });
        transport.on("close", () => transports.delete(transport.id));

        cb({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      } catch (err) {
        error("createWebRtcTransport err", err);
        cb({ error: err.toString() });
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
            const source = appData?.source || kind; // 'camera', 'mic', or 'screen'

            if (kind === "audio") cur.audio = producer.id;
            else if (source === "screen") cur.screen = producer.id;
            else cur.video = producer.id;

            sessions.set(sessionId, cur);
          }

          // --- ADDED LOGGING ---
          console.log(
            `[mediasoup] produced -> id=${producer.id} kind=${kind} session=${sessionId} source=${appData?.source || "n/a"}`,
          );
          console.log(
            "[mediasoup] sessions:",
            JSON.stringify([...sessions.entries()]),
          );

          producer.on("transportclose", () => producers.delete(producer.id));
          producer.on("close", () => producers.delete(producer.id));

          cb({ id: producer.id });
        } catch (err) {
          error("produce err", err);
          cb({ error: err.toString() });
        }
      },
    );

    socket.on("disconnect", () => info("socket disconnect", socket.id));
  });

  info("mediasoup initialized");
  return { worker, router };
}

export async function createRtpOutputForSession(
  sessionId,
  basePort = parseInt(process.env.RTP_BASE_PORT || "5004", 10),
) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("no producers for session");

  const audioPort = basePort;
  const videoPort = basePort + 2;
  const screenPort = basePort + 4;

  let audioPayloadType = null;
  let videoPayloadType = null;
  let screenPayloadType = null;

  // 1. Create PlainTransports
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

  // 2. Connect transports to ports
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

  // 3. Consume AUDIO
  if (s.audio) {
    const audioConsumer = await audioPlain.consume({
      producerId: s.audio,
      rtpCapabilities: router.rtpCapabilities,
      paused: false,
    });

    // Extract proper Opus payload type
    const opusCodec =
      audioConsumer.rtpParameters.codecs.find((c) =>
        c.mimeType.toLowerCase().includes("opus"),
      ) || audioConsumer.rtpParameters.codecs[0];

    audioPayloadType = opusCodec.payloadType;
  }

  // 4. Consume VIDEO
  if (s.video) {
    const videoConsumer = await videoPlain.consume({
      producerId: s.video,
      rtpCapabilities: router.rtpCapabilities,
      paused: false,
    });

    const videoCodec =
      videoConsumer.rtpParameters.codecs.find((c) =>
        c.mimeType.toLowerCase().startsWith("video/"),
      ) || videoConsumer.rtpParameters.codecs[0];

    videoPayloadType = videoCodec.payloadType;

    setInterval(() => videoConsumer.requestKeyFrame().catch(() => {}), 2000);
  }

  // 5. Consume SCREEN SHARE
  if (s.screen) {
    const screenConsumer = await screenPlain.consume({
      producerId: s.screen,
      rtpCapabilities: router.rtpCapabilities,
      paused: false,
    });

    screenPayloadType = screenConsumer.rtpParameters.codecs[0].payloadType;

    setInterval(() => screenConsumer.requestKeyFrame().catch(() => {}), 2000);
  }

  // 6. Return final mapping
  return {
    audioPort,
    videoPort,
    screenPort,

    audioPayloadType,
    videoPayloadType,
    screenPayloadType,

    hasScreen: !!s.screen,
  };
}

export function createSessionId() {
  return uuidv4();
}

export async function stopSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;

  if (s.audio && producers.has(s.audio)) {
    await producers.get(s.audio).producer.close();
    producers.delete(s.audio);
  }
  if (s.video && producers.has(s.video)) {
    await producers.get(s.video).producer.close();
    producers.delete(s.video);
  }
  // ✅ FIX: Added Screen Cleanup
  if (s.screen && producers.has(s.screen)) {
    await producers.get(s.screen).producer.close();
    producers.delete(s.screen);
  }

  sessions.delete(sessionId);
}
