//services/googleOAuth.js
import qs from "qs";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const SCOPES = (process.env.GOOGLE_OAUTH_SCOPES || "").split(" ");

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  throw new Error("Google OAuth env vars missing");
}

export function getAuthUrl(state) {
  console.log("clientid:", CLIENT_ID);
  console.log("redirect_uri:", REDIRECT_URI);
  console.log("Scopes:", SCOPES);

  const params = {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // important to receive refresh_token
    prompt: "consent", // make sure to get refresh_token every time for testing; in prod you might remove prompt
    include_granted_scopes: "true",
    state: state,
  };

  return `${GOOGLE_OAUTH_URL}?${qs.stringify(params)}`;
}

/**
 * Exchange authorization code for access + refresh tokens
 */
export async function exchangeCodeForTokens(code) {
  const body = {
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  };

  const resp = await axios.post(GOOGLE_TOKEN_URL, qs.stringify(body), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return resp.data; // contains access_token, expires_in, refresh_token (if available), scope, token_type, id_token
}

/**
 * Refresh access token using refresh_token
 */
export async function refreshAccessToken(refresh_token) {
  const body = {
    refresh_token,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
  };

  const resp = await axios.post(GOOGLE_TOKEN_URL, qs.stringify(body), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return resp.data; // access_token and expires_in
}
