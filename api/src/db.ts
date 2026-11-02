import { Pool } from "pg";
import { userEnv } from "./user-env";

const connectionString = userEnv("DATABASE_URL");
export const pool = new Pool({
  connectionString: connectionString || undefined,
  ssl: connectionString ? { rejectUnauthorized: false } : undefined,
});