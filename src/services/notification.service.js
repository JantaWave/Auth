import PushTokenModel from "../models/push.models.js";
import { sendExpoPush } from "./push.service.js";

export async function notifyUser(userId, payload) {
  const tokens = await PushTokenModel.getTokensByUserId(userId);
  if (!tokens?.length) return;

  return sendExpoPush(tokens, payload);
}
