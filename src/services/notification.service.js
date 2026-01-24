import PushTokenModel from "../models/push.models.js";
import NotificationModel from "../models/notification.models.js";
import { sendExpoPush } from "./push.service.js";

export async function notifyUser(userId, payload) {
  // ✅ 1) Save notification in DB (for in-app history)
  const savedNotification = await NotificationModel.create(userId, {
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    type: payload.type || "general",
  });

  // ✅ 2) Send push notification (optional if tokens exist)
  const tokens = await PushTokenModel.getTokensByUserId(userId);
  if (!tokens?.length) {
    return {
      saved: savedNotification,
      push: null,
    };
  }

  const pushResponse = await sendExpoPush(tokens, payload);

  return {
    saved: savedNotification,
    push: pushResponse,
  };
}
