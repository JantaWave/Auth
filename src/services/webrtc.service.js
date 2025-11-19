// src/services/webrtc.service.js
import mediasoup from "mediasoup";
import { info, error } from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

let worker = null;
let router = null;

// store producers by id
const producers = new Map();
// sessions map: sessionId -> { audioProducerId, videoProducerId }
const sessions = new Map();

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
          preferUdp: true,
        });
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
          const t = Array.from(router._transports.values()).find(
            (tr) => tr.id === transportId,
          );
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
      async ({ transportId, kind, rtpParameters, sessionId }, cb) => {
        try {
          const t = Array.from(router._transports.values()).find(
            (tr) => tr.id === transportId,
          );
          if (!t) throw new Error("transport not found for produce");
          const producer = await t.produce({ kind, rtpParameters });
          producers.set(producer.id, {
            id: producer.id,
            producer,
            kind,
            sessionId,
          });

          // store in sessions
          if (sessionId) {
            const cur = sessions.get(sessionId) || {};
            if (kind === "audio") cur.audio = producer.id;
            if (kind === "video") cur.video = producer.id;
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

    socket.on("disconnect", () => info("socket disconnect", socket.id));
  });

  info("mediasoup initialized");
  return { worker, router };
}

/**
 * Create server-side plain transports to output RTP for the session
 * returns object { audioPort, videoPort }
 */
export async function createRtpOutputForSession(
  sessionId,
  basePort = parseInt(process.env.RTP_BASE_PORT || "5004", 10),
) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("no producers for session");

  const audioPort = basePort;
  const videoPort = basePort + 2;

  // create plain transport for audio
  const audioPlain = await router.createPlainTransport({
    listenIp: "127.0.0.1",
    rtcpMux: false,
    comedia: false,
  });

  // create plain transport for video
  const videoPlain = await router.createPlainTransport({
    listenIp: "127.0.0.1",
    rtcpMux: false,
    comedia: false,
  });

  // connect plain transports to the target (FFmpeg UDP receive)
  await audioPlain.connect({ ip: "127.0.0.1", port: audioPort });
  await videoPlain.connect({ ip: "127.0.0.1", port: videoPort });

  // For each producer create a server-side consumer and then produce to plain transport
  if (s.audio) {
    const pInfo = producers.get(s.audio);
    if (!pInfo) throw new Error("audio producer not found");
    const consumerTransport = (await router.createPipeTransport)
      ? await router.createPipeTransport()
      : await router.createPlainTransport({ listenIp: "127.0.0.1" });
    // create consumer
    const consumer = await consumerTransport.consume({
      producerId: s.audio,
      rtpCapabilities: router.rtpCapabilities,
      paused: false,
    });
    // produce from plain transport to the remote IP (FFmpeg)
    await audioPlain.produce({
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  }

  if (s.video) {
    const pInfo = producers.get(s.video);
    if (!pInfo) throw new Error("video producer not found");
    const consumerTransport = (await router.createPipeTransport)
      ? await router.createPipeTransport()
      : await router.createPlainTransport({ listenIp: "127.0.0.1" });
    const consumer = await consumerTransport.consume({
      producerId: s.video,
      rtpCapabilities: router.rtpCapabilities,
      paused: false,
    });
    await videoPlain.produce({
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  }

  return { audioPort, videoPort };
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
  sessions.delete(sessionId);
}
