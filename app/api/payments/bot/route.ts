import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { sendWelcomeMessage, sendHelpMessage, sendFallbackMessage } from "@/lib/telegram-bot";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id: number };
  };
}

function parseCommand(text: string): { command: string | null; param?: string } {
  if (!text.startsWith("/")) return { command: null };
  const parts = text.trim().split(/\s+/);
  const command = parts[0].split("@")[0];
  return { command, param: parts.length > 1 ? parts[1] : undefined };
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !WEBHOOK_SECRET) {
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
  }
  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const text = update?.message?.text;
  const chatId = update?.message?.chat?.id;

  if (typeof text === "string" && typeof chatId === "number") {
    const { command, param } = parseCommand(text);

    if (command === "/start") {
      after(() => sendWelcomeMessage(chatId, param));
    } else if (command === "/help") {
      after(() => sendHelpMessage(chatId));
    } else if (command === null) {
      after(() => sendFallbackMessage(chatId));
    }
  }

  return NextResponse.json({ ok: true });
}