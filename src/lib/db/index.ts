import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const host     = process.env.MYSQL_HOST     ?? "127.0.0.1";
const port     = process.env.MYSQL_PORT     ? parseInt(process.env.MYSQL_PORT) : 3306;
const database = process.env.MYSQL_DATABASE ?? "kinderdesk";
const user     = process.env.MYSQL_USER     ?? "root";
const password = process.env.MYSQL_PASSWORD ?? "";
const isTiDB   = host.includes("tidbcloud.com");

// ─── Singleton pool ───────────────────────────────────────────────────────────
// In development Vite SSR hot-reloads this module on every file change.
// Without a singleton, each reload creates a brand-new pool while the old one
// stays open, exhausting MySQL's max_connections within minutes.
// We pin the pool on `globalThis` so HMR reuses the same instance.
// In production there is no HMR so this is a no-op but still safe.

declare global {
  // eslint-disable-next-line no-var
  var __mysql_pool: mysql.Pool | undefined;
}

if (!globalThis.__mysql_pool) {
  globalThis.__mysql_pool = mysql.createPool({
    host,
    port,
    database,
    user,
    password,
    ssl: isTiDB ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    // Keep the pool small:
    //   dev  → 3 connections is plenty for a single user
    //   prod → scale via DATABASE_POOL_SIZE env var (default 5)
    connectionLimit: process.env.NODE_ENV === "production"
      ? parseInt(process.env.DATABASE_POOL_SIZE ?? "5")
      : 3,
    // Release idle connections after 30 s so the process doesn't hold slots
    // it isn't using (especially helpful in dev after a long idle period).
    idleTimeout: 30_000,
    dateStrings: true,  // return DATE/DATETIME/TIMESTAMP as strings, not Date objects
  });
}

export const pool = globalThis.__mysql_pool;
export const db   = drizzle(pool);

export * from "./schema";
