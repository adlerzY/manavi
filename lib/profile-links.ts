export interface ProfileLink {
  label: string;
  url: string;
}

const MAX_CUSTOM_LINKS = 5;
const MAX_LABEL_LENGTH = 40;
const MAX_URL_LENGTH = 300;

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function sanitizeCustomLinks(input: unknown): ProfileLink[] {
  if (!Array.isArray(input)) return [];

  const result: ProfileLink[] = [];
  for (const item of input) {
    if (result.length >= MAX_CUSTOM_LINKS) break;
    if (!item || typeof item !== "object") continue;

    const label = "label" in item ? String((item as { label: unknown }).label ?? "").trim() : "";
    const url = "url" in item ? String((item as { url: unknown }).url ?? "").trim() : "";

    if (!label || !url) continue;
    if (label.length > MAX_LABEL_LENGTH || url.length > MAX_URL_LENGTH) continue;
    if (!isSafeUrl(url)) continue;

    result.push({ label, url });
  }
  return result;
}

export function parseCustomLinks(value: unknown): ProfileLink[] {
  return sanitizeCustomLinks(value);
}