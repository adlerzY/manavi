import "server-only";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; pgPool?: Pool };

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const looksLikeLocalDb = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
if (process.env.NODE_ENV === "production" && !looksLikeLocalDb && !DATABASE_URL.includes("pgbouncer=true")) {
  console.warn(
    "[prisma] DATABASE_URL فاقد pgbouncer=true است. برای اجرا پشت Supavisor/PgBouncer در حالت transaction این پارامتر را اضافه کنید، وگرنه اتصالات زیر بار زیاد به‌سرعت تمام می‌شوند."
  );
}

const DATABASE_POOL_MAX = Number(process.env.DATABASE_POOL_MAX ?? 10);
const DATABASE_POOL_IDLE_TIMEOUT_MS = Number(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS ?? 10_000);
const DATABASE_POOL_CONNECT_TIMEOUT_MS = Number(process.env.DATABASE_POOL_CONNECT_TIMEOUT_MS ?? 5_000);
const DATABASE_STATEMENT_TIMEOUT_MS = Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 15_000);

function createPool(): Pool {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: DATABASE_POOL_MAX,
    idleTimeoutMillis: DATABASE_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DATABASE_POOL_CONNECT_TIMEOUT_MS,
    statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
    query_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
    allowExitOnIdle: true,
  });

  pool.on("error", (err) => {
    console.error("[prisma] خطای غیرمنتظره روی یک اتصال idle در pg pool — نادیده گرفته شد تا سرور crash نکند.", err);
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