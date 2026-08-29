import "server-only";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { notifyAdmin } from "./admin-alert";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; pgPool?: Pool };

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const looksLikeLocalDb = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
if (process.env.NODE_ENV === "production" && !looksLikeLocalDb && !DATABASE_URL.includes("pgbouncer=true")) {
  console.warn(
    "[prisma] DATABASE_URL فاقد pgbouncer=true است. برای اجرا پشت Supavisor/PgBouncer در حالت transaction این پارامتر را اضافه کنید، وگرنه اتصالات زیر بار زیاد به‌سرعت تمام می‌شوند."
  );
}

function stripSslModeParam(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("ssl");
    return url.toString();
  } catch {
    return connectionString;
  }
}

const POOL_CONNECTION_STRING = looksLikeLocalDb ? DATABASE_URL : stripSslModeParam(DATABASE_URL);

const DATABASE_POOL_MAX = Number(process.env.DATABASE_POOL_MAX ?? 3);
const DATABASE_POOL_IDLE_TIMEOUT_MS = Number(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS ?? 10_000);
const DATABASE_POOL_CONNECT_TIMEOUT_MS = Number(process.env.DATABASE_POOL_CONNECT_TIMEOUT_MS ?? 5_000);
const DATABASE_STATEMENT_TIMEOUT_MS = Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 15_000);

const POOL_ERROR_ALERT_THROTTLE_MS = 5 * 60 * 1000;
let lastPoolErrorAlertAt = 0;

function createPool(): Pool {
  const pool = new Pool({
    connectionString: POOL_CONNECTION_STRING,
    max: DATABASE_POOL_MAX,
    idleTimeoutMillis: DATABASE_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DATABASE_POOL_CONNECT_TIMEOUT_MS,
    statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
    query_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
    allowExitOnIdle: true,
    ssl: looksLikeLocalDb ? undefined : { rejectUnauthorized: false },
  });

  pool.on("error", (err) => {
    console.error("[prisma] خطای غیرمنتظره روی یک اتصال idle در pg pool — نادیده گرفته شد تا سرور crash نکند.", err);

    const now = Date.now();
    if (now - lastPoolErrorAlertAt > POOL_ERROR_ALERT_THROTTLE_MS) {
      lastPoolErrorAlertAt = now;
      notifyAdmin("خطای غیرمنتظره در pg pool", err.message, "error").catch(() => {});
    }
  });

  return pool;
}

const pgPool = globalForPrisma.pgPool ?? createPool();
const adapter = new PrismaPg(pgPool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pgPool;
}