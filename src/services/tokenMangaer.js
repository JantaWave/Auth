// services/tokenManager.js
import { db } from "../config/db.js";
import { refreshAccessToken } from "../services/googleOAuth.js";

// Insert or update tokens
export async function upsertTokenRecord({
  tokenData,
  userId,
  google_sub,
  provider = "youtube",
}) {
  // Ensure expiry is a number (default 1 hour if missing)
  const expires_in = Number(tokenData.expires_in) || 3599;
  const expiry_ts = Date.now() + expires_in * 1000;

  const client = await db.connect();
  try {
    // Check if record exists
    const existing = await client.query(
      `SELECT id FROM user_social_accounts WHERE user_id = $1 AND provider = $2 LIMIT 1`,
      [userId, provider],
    );

    if (existing.rows.length > 0) {
      // UPDATE existing
      await client.query(
        `
        UPDATE user_social_accounts
        SET provider_user_id = $1,
            access_token = $2,
            refresh_token = COALESCE($3, refresh_token), -- Keep old refresh token if new one is null
            scope = $4,
            token_type = $5,
            expiry_ts = $6,
            updated_at = now()
        WHERE user_id = $7 AND provider = $8
        `,
        [
          google_sub,
          tokenData.access_token,
          tokenData.refresh_token, // Only updates if not null
          tokenData.scope,
          tokenData.token_type,
          expiry_ts,
          userId,
          provider,
        ],
      );
      return { ok: true, inserted: false };
    }

    // INSERT new record
    await client.query(
      `
      INSERT INTO user_social_accounts 
      (user_id, provider, provider_user_id, access_token, refresh_token, scope, token_type, expiry_ts)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        userId,
        provider,
        google_sub,
        tokenData.access_token,
        tokenData.refresh_token,
        tokenData.scope,
        tokenData.token_type,
        expiry_ts,
      ],
    );
    return { ok: true, inserted: true };
  } finally {
    client.release();
  }
}

// Get token record for user
export async function getTokenRecord({ userId, provider = "youtube" }) {
  const client = await db.connect();
  try {
    const res = await client.query(
      `SELECT * FROM user_social_accounts WHERE user_id = $1 AND provider = $2 LIMIT 1`,
      [userId, provider],
    );
    return res.rows.length ? res.rows[0] : null;
  } finally {
    client.release();
  }
}

// ✅ ROBUST REFRESH LOGIC
export async function ensureAccessToken(record) {
  const now = Date.now();
  const expiry = Number(record.expiry_ts);

  // 1. If token is still valid (buffer 60s), return it
  if (expiry - 60000 > now) {
    return { access_token: record.access_token, refreshed: false };
  }

  console.log(
    `[TokenManager] Token expired for user ${record.user_id}. Refreshing...`,
  );

  if (!record.refresh_token) {
    // No refresh token? We must force re-login.
    await deleteRecord(record.id);
    throw new Error(
      "YouTube connection lost. Please connect your account again.",
    );
  }

  try {
    // 2. Attempt to refresh with Google
    const refreshed = await refreshAccessToken(record.refresh_token);

    if (!refreshed.access_token) {
      throw new Error("Refresh failed: No access_token returned from Google");
    }

    // 3. Calculate new expiry
    const new_expires_in = Number(refreshed.expires_in) || 3599;
    const new_expiry_ts = Date.now() + new_expires_in * 1000;

    console.log("[TokenManager] Token refreshed successfully.");

    // 4. Update Database
    const client = await db.connect();
    try {
      await client.query(
        `
        UPDATE user_social_accounts
        SET access_token = $1,
            expiry_ts = $2,
            updated_at = now()
        WHERE id = $3
        `,
        [refreshed.access_token, new_expiry_ts, record.id],
      );
    } finally {
      client.release();
    }

    return { access_token: refreshed.access_token, refreshed: true };
  } catch (err) {
    console.error("[TokenManager] Refresh Error:", err.message);

    // ✅ KEY FIX: Handle "invalid_grant" (Expired/Revoked Refresh Token)
    const isInvalidGrant =
      err.response?.data?.error === "invalid_grant" ||
      err.message.includes("invalid_grant") ||
      err.response?.status === 400;

    if (isInvalidGrant) {
      console.warn(
        `[TokenManager] Refresh token dead for record ${record.id}. Deleting record.`,
      );
      await deleteRecord(record.id);
      throw new Error(
        "YouTube connection expired (7-day limit). Please connect your account again.",
      );
    }

    throw err; // Throw other errors (network, etc) normally
  }
}

// Helper to delete bad records
async function deleteRecord(id) {
  const client = await db.connect();
  try {
    await client.query("DELETE FROM user_social_accounts WHERE id = $1", [id]);
  } catch (e) {
    console.error("[TokenManager] Delete error:", e.message);
  } finally {
    client.release();
  }
}
