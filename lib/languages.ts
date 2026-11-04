export interface LanguageOption {
  code: string;
  label: string;
}

export function languageLabel(code: string, labels?: Record<string, string>): string {
  return labels?.[code] ?? code.toUpperCase();
}