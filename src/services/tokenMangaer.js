//services/tokenManager.js
import { db } from "../config/db.js";
import { refreshAccessToken } from "../services/googleOAuth.js";

// Insert or update tokens
export async function upsertTokenRecord({
  tokenData,
  userId,
  google_sub,
  provider = "youtube",
}) {
  const expiry_ts = Date.now() + tokenData.expires_in * 1000;

  const client = await db.connect();
  try {
    // Check if record exists for this user + youtube
    const existing = await client.query(
      `
      SELECT id 
      FROM user_social_accounts 
      WHERE user_id = $1 AND provider = $2 
      LIMIT 1
      `,
      [userId, provider],
    );

    if (existing.rows.length > 0) {
      // UPDATE existing
      await client.query(
        `
        UPDATE user_social_accounts
        SET provider_user_id = $1,
            access_token = $2,
            refresh_token = $3,
            scope = $4,
            token_type = $5,
            expiry_ts = $6,
            updated_at = now()
        WHERE user_id = $7 AND provider = $8
        `,
        [
          google_sub,
          tokenData.access_token,
          tokenData.refresh_token,
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
      `
      SELECT *
      FROM user_social_accounts
      WHERE user_id = $1 AND provider = $2
      LIMIT 1
      `,
      [userId, provider],
    );

    return res.rows.length ? res.rows[0] : null;
  } finally {
    client.release();
  }
}

// Ensure access token — refresh if expired
export async function ensureAccessToken(record) {
  const now = Date.now();

  // token still valid?
  if (record.expiry_ts - 60000 > now) {
    return { access_token: record.access_token, refreshed: false };
  }

  if (!record.refresh_token) {
    throw new Error("No refresh token available");
  }

  const refreshed = await refreshAccessToken(record.refresh_token);
  const expiry_ts = Date.now() + refreshed.expires_in * 1000;

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
      [refreshed.access_token, expiry_ts, record.id],
    );
  } finally {
    client.release();
  }

  return { access_token: refreshed.access_token, refreshed: true };
}
