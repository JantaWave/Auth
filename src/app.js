import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import cookieParser from "cookie-parser";
import { deviceInfoMiddleware } from "./middlewares/deviceinfo.middleware.js";
import dotenv from "dotenv";

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
app.use(cookieParser());
app.use(deviceInfoMiddleware);

// Register routes
app.use("/api/v1", routes);

app.get("/health", (_, res) => res.send("Running server"));
