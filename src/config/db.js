import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD, PGPORT } = process.env;

export const db = new Pool({
  host: PGHOST,
  database: PGDATABASE,
  user: PGUSER, // <— must be 'user', not 'username'
  password: PGPASSWORD,
  port: Number(PGPORT) || 5432,
  ssl: true,
});

// quick test
(async () => {
  try {
    const result = await db.query("SELECT version()");
    console.log("Connected to Neon:", result.rows[0]);
  } catch (err) {
    console.error("Error connecting to Neon:", err);
  }
})();
