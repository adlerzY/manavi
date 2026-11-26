import "server-only";
import {
  LOGIN_CALLBACK_DENY,
  LOGIN_CALLBACK_PREFIX,
  LOGIN_NONCE_PATTERN,
  approveLoginRequest,
  getPendingLoginDevice,
} from "./login-request";

interface BotUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
}

export interface LoginCallbackQuery {
  id: string;
  data?: string;
  from?: BotUser;
  message?: { message_id?: number; chat?: { id: number } };
}

async function callBot(method: string, payload: Record<string, unknown>): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[telegram-login]", method, err);
  }
}

export async function handleLoginStart(chatId: number, nonce: string): Promise<void> {
  const device = LOGIN_NONCE_PATTERN.test(nonce) ? await getPendingLoginDevice(nonce) : null;

  if (!device) {
    await callBot("sendMessage", {
      chat_id: chatId,
      text: "این لینک ورود منقضی شده است. به ماناوی برگرد و دوباره «ورود با تلگرام» را بزن.",
    });
    return;
  }

  await callBot("sendMessage", {
    chat_id: chatId,
    text: `درخواست ورود به ماناوی از ${device}\n\nاگر خودت این درخواست را داده‌ای تایید کن. اگر نه، «این من نیستم» را بزن.`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ تایید ورود", callback_data: `${LOGIN_CALLBACK_PREFIX}${nonce}` },
          { text: "❌ این من نیستم", callback_data: LOGIN_CALLBACK_DENY },
        ],
      ],
    },
  });
}

export async function handleLoginCallback(callback: LoginCallbackQuery): Promise<void> {
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;

  async function finish(alert: string, text: string) {
    await callBot("answerCallbackQuery", { callback_query_id: callback.id, text: alert });
    if (chatId && messageId) {
      await callBot("editMessageText", { chat_id: chatId, message_id: messageId, text });
    }
  }

  if (callback.data === LOGIN_CALLBACK_DENY) {
    await finish("درخواست رد شد", "درخواست ورود رد شد. اگر خودت نبودی، کار دیگری لازم نیست.");
    return;
  }

  const nonce = callback.data?.slice(LOGIN_CALLBACK_PREFIX.length) ?? "";
  const from = callback.from;
  if (!from || !LOGIN_NONCE_PATTERN.test(nonce)) {
    await finish("لینک نامعتبر است", "این درخواست نامعتبر است.");
    return;
  }

  const result = await approveLoginRequest(nonce, {
    telegramId: BigInt(from.id),
    firstName: from.first_name?.trim() || "کاربر",
    lastName: from.last_name ?? null,
    username: from.username ?? null,
  });

  if (result === "approved") {
    await finish("ورود تایید شد", "✅ ورود تایید شد. به مرورگر برگرد؛ خودکار وارد می‌شوی.");
  } else if (result === "deleted") {
    await finish("حساب حذف شده", "این حساب حذف شده و امکان ورود ندارد.");
  } else {
    await finish("درخواست منقضی شده", "این درخواست منقضی شده است. دوباره از ماناوی تلاش کن.");
  }
}