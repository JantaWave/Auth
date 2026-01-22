import fetch from "node-fetch"; // only if your node version needs it

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function isExpoPushToken(token) {
  return typeof token === "string" && token.startsWith("ExponentPushToken");
}

export async function sendExpoPush(tokens, payload) {
  if (!tokens || tokens.length === 0) return [];

  // ✅ keep only valid tokens
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

  // ✅ Expo supports up to 100 notifications per request
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
  }

  return results;
}
