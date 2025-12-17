import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,

  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // increase a bit for cold start
});
