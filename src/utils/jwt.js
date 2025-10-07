import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;
const ISSUER = process.env.TOKEN_ISSUER;
const AUDIENCE = process.env.TOKEN_AUDIENCE;

const ACCESS_EXP = `${process.env.ACCESS_TOKEN_EXPIRY}m`;
const REFRESH_EXP = `${process.env.REFRESH_TOKEN_EXPIRY}d`;

function generateTokenId() {
  return crypto.randomBytes(16).toString("hex");
}

export function generateAccessToken(payload, opts = {}) {
  return jwt.sign(
    {
      ...payload,
      type: "access",
      jti: generateTokenId(),
    },
    ACCESS_SECRET,
    {
      expiresIn: opts.expiresIn || ACCESS_EXP,
      issuer: ISSUER,
      audience: AUDIENCE,
    },
  );
}

export function generateRefreshToken(payload, opts = {}) {
  return jwt.sign(
    {
      id: payload.id,
      type: "refresh",
      jti: generateTokenId(),
    },
    REFRESH_SECRET,
    {
      expiresIn: opts.expiresIn || REFRESH_EXP,
      issuer: ISSUER,
      audience: AUDIENCE,
    },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}
