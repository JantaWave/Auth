import express from "express";
import cors from "cors";
// import routes from "./routes/index.js";
import cookieParser from "cookie-parser";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// register routes
// app.use("/api/v1", routes);

app.get("/health", (_, res) => res.send("Running server"));
