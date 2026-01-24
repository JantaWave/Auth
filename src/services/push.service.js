import fetch from "node-fetch";
import PushTokenModel from "../models/push.models.js";

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function isExpoPushToken(token) {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken"))
  );
}

export async function sendExpoPush(tokens, payload) {
  if (!tokens || tokens.length === 0) return [];

  const validTokens = tokens.filter(isExpoPushToken);
  if (validTokens.length === 0) return [];

  const messages = validTokens.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    priority: "high",
  }));

  const chunks = chunkArray(messages, 100);
  const results = [];

  for (const chunk of chunks) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });

    const data = await res.json();
    results.push(data);

    // ✅ Auto cleanup invalid tokens
    if (data?.data?.length) {
      for (let i = 0; i < data.data.length; i++) {
        const ticket = data.data[i];
        const token = chunk[i]?.to;

        if (ticket?.status === "error") {
          const expoError = ticket?.details?.error;

          // ✅ These tokens will never work again
          if (
            expoError === "DeviceNotRegistered" ||
            expoError === "InvalidCredentials"
          ) {
            if (token) {
              await PushTokenModel.deleteToken(token);
              console.log("🧹 Deleted invalid expo token:", token, expoError);
            }
          }
        }
      }
    }
  }

  return results;
}
