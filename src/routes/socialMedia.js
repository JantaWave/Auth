// routes/socialMedia.js
import express from "express";
import { db } from "../config/db.js";
import { authMiddleware } from "../middlewares/auth.middleware.js"; // Assuming you have auth middleware
import { ensureAccessToken, getTokenRecord } from "../services/tokenMangaer.js";

const router = express.Router();

/**
 * GET /api/v1/social-media/connections
 * Automatically refreshes expired tokens (YouTube, Facebook, Instagram)
 */
router.get("/connections", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const connections = {
      youtube: false,
      facebook: false,
      instagram: false,
    };

    const client = await db.connect();

    try {
      // Fetch all social accounts
      const result = await client.query(
        `
        SELECT id, provider, provider_user_id, expiry_ts, access_token, refresh_token
        FROM user_social_accounts
        WHERE user_id = $1
        `,
        [userId],
      );

      const now = Date.now();

      for (const row of result.rows) {
        const provider = row.provider.toLowerCase();
        const expiry = Number(row.expiry_ts);

        // If token is still valid → mark connected
        if (expiry > now) {
          connections[provider] = true;
          continue;
        }

        // Otherwise → try refresh using tokenManager
        console.log(`🔄 Refreshing expired token for: ${provider}`);

        const record = await getTokenRecord({
          userId,
          provider,
        });

        if (!record) {
          console.log(`⚠ No token record found for provider: ${provider}`);
          continue;
        }

        // Try refresh via Google or FB or IG
        const refreshed = await ensureAccessToken(record);

        if (refreshed?.access_token) {
          console.log(`✅ Successfully refreshed ${provider} token`);

          connections[provider] = true;

          // Update your DB so expiry + tokens stay correct
          await client.query(
            `
            UPDATE user_social_accounts
            SET access_token = $1,
                expiry_ts = $2,
                updated_at = NOW()
            WHERE id = $3
            `,
            [refreshed.access_token, refreshed.expiry_ts, row.id],
          );
        } else {
          console.log(`❌ Failed to refresh token for: ${provider}`);
          connections[provider] = false;
        }
      }

      return res.json({
        success: true,
        data: connections,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("❌ Error fetching social connections:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch social media connections",
    });
  }
});

/**
 * POST /api/v1/social-media/disconnect
 * Disconnects a social media platform
 * Body: { platform: "youtube" | "facebook" | "instagram" }
 */
router.post("/disconnect", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id; // From JWT middleware
    const { platform } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: "Platform is required",
      });
    }

    const validPlatforms = ["youtube", "facebook", "instagram"];
    if (!validPlatforms.includes(platform.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: "Invalid platform. Must be youtube, facebook, or instagram",
      });
    }

    const client = await db.connect();
    try {
      // Delete the social account connection
      const result = await client.query(
        `
        DELETE FROM user_social_accounts
        WHERE user_id = $1 AND provider = $2
        RETURNING id
        `,
        [userId, platform.toLowerCase()],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: `${platform} account not connected`,
        });
      }

      return res.json({
        success: true,
        message: `${platform} disconnected successfully`,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error disconnecting social media:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to disconnect social media account",
    });
  }
});

/**
 * GET /api/v1/social-media/status/:platform
 * Check if a specific platform is connected and token is valid
 */
router.get("/status/:platform", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform } = req.params;

    const client = await db.connect();
    try {
      const result = await client.query(
        `
        SELECT provider_user_id, expiry_ts, scope
        FROM user_social_accounts
        WHERE user_id = $1 AND provider = $2
        LIMIT 1
        `,
        [userId, platform.toLowerCase()],
      );

      if (result.rows.length === 0) {
        return res.json({
          connected: false,
          platform,
        });
      }

      const account = result.rows[0];
      const now = Date.now();
      const isValid = account.expiry_ts > now;

      return res.json({
        connected: isValid,
        platform,
        provider_user_id: account.provider_user_id,
        expires_at: new Date(account.expiry_ts).toISOString(),
        scope: account.scope,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error checking platform status:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to check platform status",
    });
  }
});

export async function createLiveBroadcast(
  accessToken,
  { title, description, scheduledStartTime },
) {
  const { data } = await axios.post(
    "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails",
    {
      snippet: {
        title,
        description,
        scheduledStartTime,
      },
      status: {
        privacyStatus: "public", // or "private"
      },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
      },
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  return data;
}

export async function createLiveStream(accessToken, { title, description }) {
  const { data } = await axios.post(
    "https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,contentDetails,status",
    {
      snippet: {
        title,
        description,
      },
      cdn: {
        format: "1080p",
        ingestionType: "rtmp",
      },
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  return data;
}

export async function bindStreamToBroadcast(
  accessToken,
  { broadcastId, streamId },
) {
  const { data } = await axios.post(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?part=id,contentDetails&streamId=${streamId}&id=${broadcastId}`,
    {},
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  return data;
}

export default router;
