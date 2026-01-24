import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import PostModel from "../../models/posts.models.js";
import { notifyUser } from "../../services/notification.service.js";

export const createPost = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { title, content, mediaUrl, mediaType = "image", villages } = req.body;

  if (!userId) throw new ApiError(401, "Unauthorized");

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

  const followers = await CommunityModel.getUserFollowers(userId);

  // ✅ send notification to each follower
  await Promise.all(
    followers.map((f) =>
      notifyUser(f.follower_id, {
        title: "New Post",
        body: `${req.user.first_name} ${req.user.last_name} posted something new`,
        data: { type: "POST", postId, leaderId: userId },
      }),
    ),
  );

  return res
    .status(201)
    .json(new ApiResponse(201, { postId }, "Post created successfully"));
});

export const getUserPost = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  const limit = Number(req.query.limit || 10);
  const cursor = req.query.cursor || null;

  const result = await PostModel.getUserPosts(userId, limit, cursor);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Posts fetched successfully"));
});

export const likeOrDislikePost = asyncHandler(async (req, res) => {
  const { postId, userId } = req.params;
  if (!userId || !postId)
    throw new ApiError(401, "UserId and postId is required.");

  const isLiked = await PostModel.isPostLikedByUser(postId, userId);

  if (isLiked.liked) {
    await PostModel.likePost(userId, postId);

    const postOwnerId = await PostModel.getPostOwnerId(postId);

    if (postOwnerId && postOwnerId !== userId) {
      await notifyUser(postOwnerId, {
        title: "New Like",
        body: "Someone liked your post",
        data: { type: "LIKE", postId },
      });
    }
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

export const getPostsForUser = asyncHandler(async (req, res) => {
  console.log("post fetching starts");
  const userId = req.user?.id;
  if (!userId) throw new ApiError(401, "Unauthorised");

  const limit = Number(req.query.limit || 5);
  const cursor = req.query.cursor || null;

  const fetchedPosts = await PostModel.getPostForUsers(userId, limit, cursor);
  const posts = fetchedPosts.posts;
  const nextCursor = fetchedPosts.nextCursor;
  console.log(posts);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        posts,
        nextCursor,
      },
      "Posts fetched",
    ),
  );
});

export const postComments = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { content, parentCommentId } = req.body;
  const userId = req.user.id;

  const comment = await PostModel.postComment(
    postId,
    userId,
    content,
    parentCommentId,
  );
  if (!comment) throw new ApiError(500, "Internal Server Error");
  const postOwnerId = await PostModel.getPostOwnerId(postId);
  if (postOwnerId && postOwnerId !== userId) {
    await notifyUser(postOwnerId, {
      title: "New Comment",
      body: `${req.user.first_name} commented on your post`,
      data: { type: "COMMENT", postId, commentId: comment.id },
    });
  }

  return res.status(200).json(new ApiResponse(200, comment, "Comment posted"));
});

export const getPostComments = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const limit = Number(req.query.limit || 10);
  const cursor = req.query.cursor || null;

  const comments = await PostModel.getPostComments(postId, limit, cursor);

  return res
    .status(200)
    .json(new ApiResponse(200, comments, "Comments fetched successfully"));
});
