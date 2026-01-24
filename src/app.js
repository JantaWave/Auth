import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import uploadRoutes from "./routes/upload.js";
import postRoutes from "./routes/posts.js";
import routes_OAuth from "./routes/youtubeAuth.js";
import socialMediaRouter from "./routes/socialMedia.js";
import redirectsRouter from "./routes/redirects.js";
import liveStreamRouter from "./routes/liveStream.js";
import NotificationRoutes from "./routes/notificationRoutes.js";
import activityRoutes from "./routes/activity.js";
import pushRoutes from "./routes/pushRoutes.js";
import cookieParser from "cookie-parser";
import { deviceInfoMiddleware } from "./middlewares/deviceinfo.middleware.js";
import dotenv from "dotenv";
import { errorHandler } from "./middlewares/error.middleware.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";

dotenv.config();

export const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // if you need to send cookies or auth headers
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(deviceInfoMiddleware);

// Register routes
app.use("/api/v1", routes);
app.use("/api/v1/OAuth", routes_OAuth);
app.use("/api/v1/social-media", socialMediaRouter);
app.use("/api/v1/streams", authMiddleware, liveStreamRouter);
app.use("/api/v1/upload", uploadRoutes);
app.use("/api/v1/posts", authMiddleware, postRoutes);
app.use("/api/v1/activity", authMiddleware, activityRoutes);
app.use("/api/v1/push", authMiddleware, pushRoutes);
app.use("/api/v1/notifications", authMiddleware, NotificationRoutes);

app.use("/r", redirectsRouter);

app.get("/health", (_, res) => res.send("Running server"));

app.use(errorHandler);
