export const LANGUAGE_LABELS: Record<string, string> = {
  fa: "فارسی",
  en: "انگلیسی",
  ar: "عربی",
  tr: "ترکی",
  ja: "ژاپنی",
  ko: "کره‌ای",
};

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}