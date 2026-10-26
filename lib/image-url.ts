import "server-only";

function parseUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

function getManagedPublicPrefix(): string | null {
  const base = parseUrl(process.env.S3_PUBLIC_BASE_URL);
  if (!base || base.protocol !== "https:") return null;
  return `${base.origin}${base.pathname.replace(/\/+$/, "")}/`;
}

function getLegacyHosts(): Set<string> {
  const hosts = new Set<string>();

  const cdn = parseUrl(process.env.STORAGE_CDN_BASE_URL);
  if (cdn) hosts.add(cdn.hostname);

  for (const host of (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "").split(",")) {
    const trimmed = host.trim();
    if (trimmed) hosts.add(trimmed);
  }
  return hosts;
}

export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;

    const prefix = getManagedPublicPrefix();
    if (prefix) {
      const full = `${parsed.origin}${parsed.pathname}`;
      if (full.startsWith(prefix) && full.slice(prefix.length).startsWith("public/")) return true;
    }
    return getLegacyHosts().has(parsed.hostname);
  } catch {
    return false;
  }
}