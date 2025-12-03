import { Router } from "express";
import { generatePresignedUrl } from "../services/storage.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post(
  "/presigned-url",
  asyncHandler(async (req, res) => {
    const { fileName, fileType } = req.body;
    if (!fileName || !fileType) {
      return res.status(400).json({ error: "Missing fileName or fileType" });
    }
    try {
      const data = await generatePresignedUrl(fileName, fileType);
      res.json(data);
    } catch (error) {
      console.error("Error generating presigned URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  }),
);

export default router;
