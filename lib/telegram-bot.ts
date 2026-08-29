import "server-only";
import { processInBatches } from "./batch-upload";

function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

function getMiniAppUrl(): string | null {
  return process.env.NEXT_PUBLIC_MINI_APP_URL || null;
}

function getBotUsername(): string | undefined {
  return process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
}

function getMiniAppShortName(): string | undefined {
  return process.env.NEXT_PUBLIC_TELEGRAM_MINI_APP_SHORT_NAME;
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

async function sendTelegramMessage(botToken: string, chatId: bigint | number, text: string, options?: SendOptions) {
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

export function buildOpenMiniAppKeyboard(startParam?: string) {
  const botUsername = getBotUsername();
  const miniAppShortName = getMiniAppShortName();
  const miniAppUrl = getMiniAppUrl();

  if (startParam && botUsername && miniAppShortName) {
    return {
      inline_keyboard: [
        [
          {
            text: "باز کردن مینی‌اپ",
            url: `https://t.me/${botUsername}/${miniAppShortName}?startapp=${encodeURIComponent(startParam)}`,
          },
        ],
      ],
    };
  }
  return {
    inline_keyboard: [[{ text: "باز کردن مینی‌اپ", web_app: { url: `${miniAppUrl ?? ""}/app` } }]],
  };
}

export async function sendWelcomeMessage(chatId: number, startParam?: string): Promise<void> {
  const botToken = getBotToken();
  if (!botToken) return;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "به مناوی خوش آمدید! برای شروع مطالعه روی دکمه زیر بزنید.",
      reply_markup: buildOpenMiniAppKeyboard(startParam),
    }),
  }).catch(() => {});
}

export async function sendHelpMessage(chatId: number): Promise<void> {
  const botToken = getBotToken();
  if (!botToken) return;

  const text = [
    "راهنمای ماناوی:",
    "— برای باز کردن اپ روی دکمه پایین یا دکمه منوی کنار پیام‌رسان بزنید.",
    "— داخل اپ می‌تونید مانهوا/مانگا بخونید، سکه بخرید و از مترجم‌ها حمایت مالی کنید.",
    "— برای پشتیبانی با ادمین در ارتباط باشید.",
  ].join("\n");

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: buildOpenMiniAppKeyboard() }),
  }).catch(() => {});
}

export async function sendFallbackMessage(chatId: number): Promise<void> {
  const botToken = getBotToken();
  if (!botToken) return;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "متوجه این پیام نشدم — برای شروع از دکمه زیر یا دستور /help استفاده کنید.",
      reply_markup: buildOpenMiniAppKeyboard(),
    }),
  }).catch(() => {});
}