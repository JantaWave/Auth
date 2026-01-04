import ActivityModel from "../models/activity.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const getMyActivity = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { limit = 20, cursor = null } = req.query;

  const data = await ActivityModel.getForLeader(userId, Number(limit), cursor);

  res
    .status(200)
    .json(new ApiResponse(200, data, "Activity fetched successfully"));
});
