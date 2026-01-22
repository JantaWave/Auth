import UserModel from "../../models/auth.models.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const searchLeaders = asyncHandler(async (req, res) => {
  const { query } = req.query;
  const currentUserId = req.user?.id;

  // Trim and check if query is empty
  if (!query || !query.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  // Pass the trimmed query directly
  const data = await UserModel.getLeaders(query.trim(), currentUserId);

  return res
    .status(200)
    .json(new ApiResponse(200, data, "Leaders searched successfully."));
});
export const getUserProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params; // The profile ID from the URL
  const viewerId = req.user.id; // The logged-in user ID (from verifyJWT)
  console.log("user id", req.user.id);

  if (!userId) throw new ApiError(400, "User ID is required");

  const user = await UserModel.getProfileWithStats(userId, viewerId);

  if (!user) throw new ApiError(404, "User not found");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User profile fetched successfully"));
});
