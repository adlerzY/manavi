import "server-only";
import { processInBatches } from "./batch-upload";

function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

function getMiniAppUrl(): string | null {
  return process.env.NEXT_PUBLIC_MINI_APP_URL || null;
}

interface NotifyChapterInput {
  telegramIds: bigint[];
  comicTitle: string;
  comicSlug: string;
  chapterNumber: number;
  chapterId: string;
}

interface SendOptions {
  buttonText?: string;
  buttonUrl?: string;
}

const NOTIFY_BATCH_SIZE = 20;
const NOTIFY_BATCH_DELAY_MS = 1100;

async function sendTelegramMessage(botToken: string, chatId: bigint, text: string, options?: SendOptions) {
  const reply_markup = options?.buttonText && options?.buttonUrl
    ? { inline_keyboard: [[{ text: options.buttonText, web_app: { url: options.buttonUrl } }]] }
    : undefined;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId.toString(),
      text,
      ...(reply_markup ? { reply_markup } : {}),
    }),
  });
}

export async function notifyNewChapter(input: NotifyChapterInput) {
  const botToken = getBotToken();
  const miniAppUrl = getMiniAppUrl();
  if (!botToken || !miniAppUrl || input.telegramIds.length === 0) return;

  const readUrl = `${miniAppUrl}/app/read/${input.chapterId}`;
  const text = `فصل جدید ${input.comicTitle} منتشر شد: چپتر ${input.chapterNumber}`;

  await processInBatches(
    input.telegramIds,
    NOTIFY_BATCH_SIZE,
    async (telegramId) => {
      try {
        await sendTelegramMessage(botToken, telegramId, text, { buttonText: "خواندن چپتر جدید", buttonUrl: readUrl });
      } catch (err) {
        console.error("[telegram-bot] failed to notify", telegramId.toString(), err);
      }
    },
    NOTIFY_BATCH_DELAY_MS
  );
}