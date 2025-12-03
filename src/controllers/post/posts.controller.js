import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import PostModel from "../../models/posts.models.js";

export const createPost = asyncHandler(async (req, res) => {
  const {
    userId,
    title,
    content,
    mediaUrl,
    mediaType = "image",
    villages,
  } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const result = await PostModel.addPost(
    userId,
    title,
    content,
    mediaUrl,
    mediaType,
    villages,
  );

  const postId = result.id;

  return res
    .status(201)
    .json(new ApiResponse(201, { postId }, "Post created successfully"));
});

export const getUserPost = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  const posts = await PostModel.getUserPosts(userId);
  return res
    .status(200)
    .json(new ApiResponse(200, posts, "Posts fetched successfully"));
});

export const likeOrDislikePost = asyncHandler(async (req, res) => {
  const { postId, userId } = req.params;
  if (!userId || !postId)
    throw new ApiError(401, "UserId and postId is required.");

  const isLiked = await PostModel.isPostLikedByUser(postId, userId);

  if (isLiked.liked) {
    await PostModel.dislikePost(userId, postId);
  } else {
    await PostModel.likePost(userId, postId);
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { success: true },
        "liked or disliked successfully.",
      ),
    );
});
