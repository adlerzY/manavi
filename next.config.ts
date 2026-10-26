import type { NextConfig } from "next";

interface RemotePatternEntry {
  protocol: "https";
  hostname: string;
  pathname?: string;
}

function parseUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

function buildRemotePatterns(): RemotePatternEntry[] {
  const patterns: RemotePatternEntry[] = [];
  const seen = new Set<string>();

  function add(hostname: string, pathname?: string) {
    const id = `${hostname}|${pathname ?? ""}`;
    if (seen.has(id)) return;
    seen.add(id);
    patterns.push(pathname ? { protocol: "https", hostname, pathname } : { protocol: "https", hostname });
  }

  const publicBase = parseUrl(process.env.S3_PUBLIC_BASE_URL);
  if (publicBase) {
    const basePath = publicBase.pathname.replace(/\/+$/, "");
    add(publicBase.hostname, `${basePath}/public/**`);
  }

  const cdn = parseUrl(process.env.STORAGE_CDN_BASE_URL);
  if (cdn) add(cdn.hostname);

  for (const host of (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "").split(",")) {
    const trimmed = host.trim();
    if (trimmed) add(trimmed);
  }

  return patterns;
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: buildRemotePatterns(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  turbopack: {
    resolveAlias: {
      buffer: "buffer",
    },
  },
};

export default nextConfig;