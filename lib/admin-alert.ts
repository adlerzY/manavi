import "server-only";

const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID;

function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export type AdminAlertLevel = "info" | "warning" | "error";

const LEVEL_EMOJI: Record<AdminAlertLevel, string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "🔴",
};

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyAdmin(title: string, details?: string, level: AdminAlertLevel = "error"): Promise<void> {
  const botToken = getBotToken();
  if (!botToken || !ADMIN_CHAT_ID) return;

  const text = `${LEVEL_EMOJI[level]} <b>${escapeHtml(title)}</b>${details ? `\n${escapeHtml(details)}` : ""}\n\n<i>${new Date().toLocaleString("fa-IR")}</i>`;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    console.error("[admin-alert] failed to notify admin", err);
  }
}