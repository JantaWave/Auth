import redisClient from "../config/redis.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import crypto from "crypto";

export async function blacklistToken(token, type = "access") {
  const decoded = JSON.parse(
    Buffer.from(token.split(".")[1], "base64").toString(),
  );
  if (!decoded?.exp) return false;
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await redisClient.setEx(`blacklist:${type}:${token}`, ttl, "revoked");
  }
  return true;
}

export async function isTokenBlacklisted(token, type = "access") {
  return (await redisClient.exists(`blacklist:${type}:${token}`)) === 1;
}

export async function rotateRefreshToken(oldToken) {
  if (await isTokenBlacklisted(oldToken, "refresh")) {
    return { accessToken: null, refreshToken: null, error: "TOKEN_REUSED" };
  }

  try {
    const payload = verifyRefreshToken(oldToken);

    await blacklistToken(oldToken, "refresh");

    const accessToken = generateAccessToken({ id: payload.id });
    const refreshToken = generateRefreshToken({ id: payload.id });

    return { accessToken, refreshToken, error: null };
  } catch (err) {
    return {
      accessToken: null,
      refreshToken: null,
      error: "INVALID_REFRESH_TOKEN",
    };
  }
}
