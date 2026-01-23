import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import PushTokenModel from "../../models/push.models.js";

export const registerPushToken = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { expoPushToken } = req.body;
  console.log(`Expo Token for userId ${userId}: ${expoPushToken}`);

  if (!userId) throw new ApiError(401, "Unauthorized");
  if (!expoPushToken) throw new ApiError(400, "expoPushToken is required");

  await PushTokenModel.save(userId, expoPushToken);

  return res.status(200).json(new ApiResponse(200, null, "Push token saved"));
});
