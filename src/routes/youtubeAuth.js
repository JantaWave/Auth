//routes/youtubeAuth.js
import express from "express";
import { getAuthUrl, exchangeCodeForTokens } from "../services/googleOAuth.js";
import {
  upsertTokenRecord,
  getTokenRecord,
  ensureAccessToken,
} from "../services/tokenMangaer.js";
import {
  createLiveBroadcast,
  createLiveStream,
  bindStreamToBroadcast,
} from "../services/youtubeApi.js";
import axios from "axios";
import { jwtDecode } from "jwt-decode";

const router = express.Router();

/**
 * GET /api/v1/OAuth/init
 * returns the google consent url (frontend should open it)
 * optional query param: state
 */
router.get("/init", (req, res) => {
  try {
    const userId = req.query.userId; // << FIXED
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const url = getAuthUrl(userId);
    console.log("Generated OAuth URL:", url); // debug

    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build auth url" });
  }
});

/**
 * GET /api/v1/OAuth/callback
 * Google will call this redirect with ?code=...&state=...
 *
 * Important: set this redirect URI in Google Cloud Console for your OAuth client.
 */
router.get("/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state || null;

    if (!code) return res.status(400).send("Missing code in query");

    const tokenData = await exchangeCodeForTokens(code);
    // tokenData may include id_token (JWT) from which we can extract google account sub
    let google_sub = null;
    try {
      if (tokenData.id_token) {
        const decoded = jwtDecode(tokenData.id_token);
        google_sub = decoded.sub;
      }
    } catch (e) {
      // ignore
    }

    // Save in supabase. You may want to link to your user in DB using 'state' or session.
    await upsertTokenRecord({ tokenData, google_sub, userId: state || null });

    // Redirect back to your app (deep link) or show a success page
    // If your frontend listens for a deep link, use that. else show a simple success JSON.
    const front = process.env.FRONTEND_URL;
    // If you want to redirect to frontend with indicator:
    return res.redirect(`${front}?connected=true&google_sub=${google_sub}`);
  } catch (err) {
    console.error("callback error", err.response?.data ?? err.message ?? err);
    return res.status(500).json({ error: "Failed to exchange code" });
  }
});

/**
 * POST /api/v1/OAuth/create-live
 * body: { google_sub } or { userId }
 *
 * Creates a broadcast + stream and binds them, returns ingestion info (RTMP URL + key)
 */
router.post("/create-live", async (req, res) => {
  try {
    const { google_sub, userId, title, description, scheduledStartTime } =
      req.body || {};
    if (!google_sub && !userId)
      return res.status(400).json({ error: "Provide google_sub or userId" });

    const record = await getTokenRecord({ google_sub, userId });
    if (!record)
      return res.status(404).json({ error: "No token record found" });

    const { access_token } = await ensureAccessToken(record);

    // Create Broadcast
    const broadcast = await createLiveBroadcast(access_token, {
      title: title || "Live from My App",
      description: description || "Started from app",
      scheduledStartTime: scheduledStartTime || undefined,
    });

    // Create Stream
    const stream = await createLiveStream(access_token, {
      title: (title || "My Stream") + " stream",
      description: description || "",
    });

    // Bind them
    const binding = await bindStreamToBroadcast(access_token, {
      broadcastId: broadcast.id,
      streamId: stream.id,
    });

    // ingestion info is in stream.cdn.ingestionInfo
    const ingestion = stream.cdn?.ingestionInfo || null;

    // Return details to frontend
    return res.json({
      broadcast,
      stream,
      binding,
      ingestion,
    });
  } catch (err) {
    console.error("create-live err", err.response?.data ?? err.message ?? err);
    res.status(500).json({
      error: "Failed to create live broadcast/stream",
      detail: err.message,
    });
  }
});

export default router;
