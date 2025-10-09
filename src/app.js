import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import cookieParser from "cookie-parser";
import { deviceInfoMiddleware } from "./middlewares/deviceinfo.middleware.js";

export const app = express();

app.use(
  cors({
    origin: ["https://dev-auth.jantawave.co.in"],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(deviceInfoMiddleware);

// register routes
app.use("/api/v1", routes);

app.get("/health", (_, res) => res.send("Running server"));
