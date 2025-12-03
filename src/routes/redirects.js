import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import StreamModel from "../models/streams.models.js";

const router = Router();

const PLATFORM_MAP = {
  y: "youtube",
  f: "facebook",
  i: "instagram",
};

router.get(
  "/:platform/:token",
  asyncHandler(async (req, res) => {
    let { platform, token } = req.params;

    if (!platform || !token) {
      throw new ApiError(400, "Platform and token are required");
    }

    // Normalize platform
    platform = platform.toLowerCase();
    platform = PLATFORM_MAP[platform] || platform;

    // Validate platform
    if (!["youtube", "facebook", "instagram"].includes(platform)) {
      throw new ApiError(
        400,
        `Invalid platform '${platform}'. Use: youtube, facebook, instagram OR y/f/i`,
      );
    }

    // Fetch session using short token
    const session = await StreamModel.getStreamsFromToken(token);

    if (!session) {
      throw new ApiError(404, "Session not found from token");
    }

    // Handle JSON parsing
    let shareUrls = session.share_urls;
    if (typeof shareUrls === "string") {
      try {
        shareUrls = JSON.parse(shareUrls);
      } catch {
        throw new ApiError(500, "Invalid share_urls format in database");
      }
    }

    if (!shareUrls || typeof shareUrls !== "object") {
      throw new ApiError(404, "Share URLs not available for this session");
    }

    const redirectUrl = shareUrls[platform];

    if (!redirectUrl) {
      throw new ApiError(
        404,
        `No redirect URL found for platform '${platform}'`,
      );
    }

    // Redirect user to final external share URL
    return res.redirect(redirectUrl);
  }),
);

export default router;
