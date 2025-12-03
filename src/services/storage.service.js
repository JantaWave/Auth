import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const S3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export const generatePresignedUrl = async (fileName, fileType) => {
  const extension = path.extname(fileName);
  const key = `posts/${uuidv4()}${extension}`; // Unique filename

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: fileType,
  });

  // Generate a URL valid for 5 minutes
  const url = await getSignedUrl(S3, command, { expiresIn: 300 });

  return {
    uploadUrl: url, // Use this to PUT the file
    fileUrl: `${process.env.R2_PUBLIC_URL}/${key}`, // Use this to SAVE in DB
  };
};
