import ActivityModel from "../../models/activity.models.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

/* ---------------- GET LEADER ACTIVITY (Received Activities) ---------------- */
export const getUserActivity = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { limit = 10, cursor = null } = req.query;

  const data = await ActivityModel.getForLeader(userId, Number(limit), cursor);

  res
    .status(200)
    .json(new ApiResponse(200, data, "Activity fetched successfully"));
});

/* ---------------- GET MY ACTIVITY (Activities I Performed) ---------------- */
export const getMyActivity = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { limit = 10, cursor = null } = req.query;

  const data = await ActivityModel.getMyActivity(userId, Number(limit), cursor);

  res
    .status(200)
    .json(new ApiResponse(200, data, "My activity fetched successfully"));
});

/* ---------------- GET COMBINED ACTIVITY (Both Sent & Received) ---------------- */
export const getCombinedActivity = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { limit = 10, cursor = null } = req.query;

  const data = await ActivityModel.getCombinedActivity(
    userId,
    Number(limit),
    cursor,
  );

  res
    .status(200)
    .json(new ApiResponse(200, data, "Combined activity fetched successfully"));
});

/* ---------------- GET ACTIVITY STATS ---------------- */
export const getActivityStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const stats = await ActivityModel.getActivityStats(userId);

  res
    .status(200)
    .json(new ApiResponse(200, stats, "Activity stats fetched successfully"));
});

/* ---------------- DELETE ACTIVITY ---------------- */
export const deleteActivity = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { activityId } = req.params;

  if (!activityId) {
    throw new ApiError(400, "Activity ID is required");
  }

  const deletedActivity = await ActivityModel.delete(activityId, userId);

  if (!deletedActivity) {
    throw new ApiError(404, "Activity not found or unauthorized");
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, deletedActivity, "Activity deleted successfully"),
    );
});

/* ---------------- GET ACTIVITY BY TYPE ---------------- */
export const getActivityByType = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { type } = req.params; // 'received' | 'sent' | 'combined'
  const { limit = 10, cursor = null } = req.query;

  let data;

  switch (type) {
    case "received":
      data = await ActivityModel.getForLeader(userId, Number(limit), cursor);
      break;
    case "sent":
      data = await ActivityModel.getMyActivity(userId, Number(limit), cursor);
      break;
    case "combined":
      data = await ActivityModel.getCombinedActivity(
        userId,
        Number(limit),
        cursor,
      );
      break;
    default:
      throw new ApiError(
        400,
        "Invalid activity type. Use 'received', 'sent', or 'combined'",
      );
  }

  res
    .status(200)
    .json(new ApiResponse(200, data, `${type} activity fetched successfully`));
});
