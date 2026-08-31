import "server-only";
import { processInBatches } from "./batch-upload";
import { prisma } from "./prisma";

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

interface TelegramInlineButton {
  text: string;
  url?: string;
  web_app?: { url: string };
}

interface TelegramReplyMarkup {
  inline_keyboard: TelegramInlineButton[][];
}

const NOTIFY_BATCH_SIZE = 20;
const NOTIFY_BATCH_DELAY_MS = 1100;

async function sendTelegramMessage(
  botToken: string,
  chatId: bigint | number,
  text: string,
  replyMarkup?: TelegramReplyMarkup
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });

    if (res.ok) return true;

    if (res.status !== 403) {
      const body = await res.text().catch(() => "");
      console.error("[telegram-bot] sendMessage failed", chatId.toString(), res.status, body.slice(0, 200));
    }
    return false;
  } catch (err) {
    console.error("[telegram-bot] sendMessage network error", chatId.toString(), err);
    return false;
  }
}

export async function notifyNewChapter(input: NotifyChapterInput) {
  const botToken = getBotToken();
  const miniAppUrl = getMiniAppUrl();
  if (!botToken || !miniAppUrl || input.telegramIds.length === 0) return;

  const readUrl = `${miniAppUrl}/app/read/${input.chapterId}`;
  const text = `فصل جدید ${input.comicTitle} منتشر شد: چپتر ${input.chapterNumber}`;
  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: [[{ text: "خواندن چپتر جدید", web_app: { url: readUrl } }]],
  };

  await processInBatches(
    input.telegramIds,
    NOTIFY_BATCH_SIZE,
    (telegramId) => sendTelegramMessage(botToken, telegramId, text, replyMarkup),
    NOTIFY_BATCH_DELAY_MS
  );
}

export function buildOpenMiniAppKeyboard(startParam?: string): TelegramReplyMarkup {
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

  await sendTelegramMessage(
    botToken,
    chatId,
    "به مناوی خوش آمدید! برای شروع مطالعه روی دکمه زیر بزنید.",
    buildOpenMiniAppKeyboard(startParam)
  );
}

export async function sendHelpMessage(chatId: number): Promise<void> {
  const botToken = getBotToken();
  if (!botToken) return;

  const text = [
    "راهنمای ماناوی:",
    "— برای باز کردن اپ روی دکمه پایین یا دکمه منوی کنار پیام‌رسان بزنید.",
    "— داخل اپ می‌تونید مانهوا/مانگا بخونید، سکه بخرید و از مترجم‌ها حمایت مالی کنید.",
    "— برای دیدن موجودی سکه‌تون دستور /balance رو بفرستید.",
    "— برای پشتیبانی با ادمین در ارتباط باشید.",
  ].join("\n");

  await sendTelegramMessage(botToken, chatId, text, buildOpenMiniAppKeyboard());
}

export async function sendBalanceMessage(chatId: number, userTelegramId?: number): Promise<void> {
  const botToken = getBotToken();
  if (!botToken) return;

  const telegramId = userTelegramId ?? chatId;

  const user = await prisma.user
    .findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { coinsBalance: true, isBanned: true, deletedAt: true },
    })
    .catch(() => null);

  const text =
    !user || user.deletedAt
      ? "برای مشاهده موجودی سکه، ابتدا یک‌بار مینی‌اپ ماناوی را باز کنید."
      : user.isBanned
      ? "حساب شما مسدود شده است."
      : `موجودی فعلی شما: 🪙 ${user.coinsBalance.toLocaleString("fa-IR")} سکه`;

  await sendTelegramMessage(botToken, chatId, text, buildOpenMiniAppKeyboard());
}

export async function sendFallbackMessage(chatId: number): Promise<void> {
  const botToken = getBotToken();
  if (!botToken) return;

  await sendTelegramMessage(
    botToken,
    chatId,
    "متوجه این پیام نشدم — برای شروع از دکمه زیر یا دستور /help استفاده کنید.",
    buildOpenMiniAppKeyboard()
  );
}