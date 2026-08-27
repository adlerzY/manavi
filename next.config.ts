import type { NextConfig } from "next";

function buildRemotePatterns() {
  const patterns: { protocol: "https"; hostname: string }[] = [];
  const seen = new Set<string>();

  function addHostFromUrl(rawUrl: string | undefined) {
    if (!rawUrl) return;
    try {
      const hostname = new URL(rawUrl).hostname;
      if (!seen.has(hostname)) {
        seen.add(hostname);
        patterns.push({ protocol: "https", hostname });
      }
    } catch {

    }
  }

  addHostFromUrl(process.env.S3_PUBLIC_BASE_URL);
  addHostFromUrl(process.env.STORAGE_CDN_BASE_URL);

  const extraHosts = (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  for (const hostname of extraHosts) {
    if (!seen.has(hostname)) {
      seen.add(hostname);
      patterns.push({ protocol: "https", hostname });
    }
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