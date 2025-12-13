import UserModel from "../../models/auth.models.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// --- FOLLOW USER ---
export const followUser = asyncHandler(async (req, res) => {
  const { id: targetUserId } = req.params; // The user to follow
  const followerId = req.user.id; // The logged-in user
  console.log(req.params);

  if (targetUserId === followerId) {
    throw new ApiError(400, "You cannot follow yourself");
  }

  await UserModel.follow(followerId, targetUserId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "User followed successfully"));
});

// --- UNFOLLOW USER ---
export const unfollowUser = asyncHandler(async (req, res) => {
  const { id: targetUserId } = req.params;
  const followerId = req.user.id;

  await UserModel.unfollow(followerId, targetUserId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "User unfollowed successfully"));
});
