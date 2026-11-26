import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { AccountDeletedError, findOrCreateTelegramUser, type TelegramIdentity } from "./telegram-user";

export const LOGIN_REQUEST_TTL_MS = 5 * 60 * 1000;
export const LOGIN_NONCE_PATTERN = /^[a-f0-9]{32}$/;
export const LOGIN_START_PREFIX = "login_";
export const LOGIN_CALLBACK_PREFIX = "lgok:";
export const LOGIN_CALLBACK_DENY = "lgno";

export function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
    ? "Opera"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Safari\//.test(ua)
    ? "Safari"
    : "مرورگر ناشناس";
  const system = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
    ? "macOS"
    : /Linux/.test(ua)
    ? "Linux"
    : "";
  return system ? `${browser} روی ${system}` : browser;
}

export async function createLoginRequest(userAgent: string | null): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  await prisma.loginRequest.create({
    data: {
      nonce,
      deviceLabel: describeDevice(userAgent),
      expiresAt: new Date(Date.now() + LOGIN_REQUEST_TTL_MS),
    },
  });
  prisma.loginRequest
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } })
    .catch(() => {});
  return nonce;
}

export async function getPendingLoginDevice(nonce: string): Promise<string | null> {
  const request = await prisma.loginRequest.findUnique({ where: { nonce } });
  if (!request || request.status !== "PENDING" || request.expiresAt <= new Date()) return null;
  return request.deviceLabel ?? "مرورگر";
}

export type ApproveResult = "approved" | "expired" | "deleted";

export async function approveLoginRequest(nonce: string, identity: TelegramIdentity): Promise<ApproveResult> {
  const request = await prisma.loginRequest.findUnique({ where: { nonce } });
  if (!request || request.status !== "PENDING" || request.expiresAt <= new Date()) return "expired";

  let userId: string;
  try {
    userId = (await findOrCreateTelegramUser(identity)).id;
  } catch (err) {
    if (err instanceof AccountDeletedError) return "deleted";
    throw err;
  }

  const updated = await prisma.loginRequest.updateMany({
    where: { id: request.id, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "APPROVED", userId },
  });
  return updated.count === 1 ? "approved" : "expired";
}

export type PollResult = { status: "pending" } | { status: "expired" } | { status: "approved"; userId: string };

export async function pollLoginRequest(nonce: string): Promise<PollResult> {
  const request = await prisma.loginRequest.findUnique({ where: { nonce } });
  if (!request || request.status === "CONSUMED" || request.expiresAt <= new Date()) return { status: "expired" };
  if (request.status === "PENDING" || !request.userId) return { status: "pending" };

  const claimed = await prisma.loginRequest.updateMany({
    where: { id: request.id, status: "APPROVED" },
    data: { status: "CONSUMED" },
  });
  if (claimed.count !== 1) return { status: "expired" };
  return { status: "approved", userId: request.userId };
}