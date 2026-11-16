import { Pool } from "pg";
import { userEnv } from "./user-env";

const connectionString = userEnv("DATABASE_URL");
const databaseHost = connectionString
  ? new URL(connectionString).hostname
  : null;
const isLocalDatabase =
  databaseHost === "localhost" ||
  databaseHost === "127.0.0.1" ||
  databaseHost === "[::1]";

export const pool = new Pool({
  connectionString: connectionString || undefined,
  ssl: connectionString && !isLocalDatabase
    ? { rejectUnauthorized: false }
    : undefined,
});
