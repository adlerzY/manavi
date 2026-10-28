export type AssetKind = "comic-cover" | "comic-banner" | "category-image" | "genre-image";

export interface AssetKindSpec {
  scope: "comics" | "categories" | "genres";
  segment: "cover" | "hero-background" | "thumbnail";
  maxInputBytes: number;
  maxWidth: number;
  maxHeight: number;
  webpQuality: number;
}

const MB = 1024 * 1024;

export const ASSET_KIND_SPECS: Record<AssetKind, AssetKindSpec> = {
  "comic-cover": {
    scope: "comics",
    segment: "cover",
    maxInputBytes: 15 * MB,
    maxWidth: 1000,
    maxHeight: 1500,
    webpQuality: 84,
  },
  "comic-banner": {
    scope: "comics",
    segment: "hero-background",
    maxInputBytes: 15 * MB,
    maxWidth: 2400,
    maxHeight: 1350,
    webpQuality: 82,
  },
  "category-image": {
    scope: "categories",
    segment: "thumbnail",
    maxInputBytes: 8 * MB,
    maxWidth: 640,
    maxHeight: 640,
    webpQuality: 84,
  },
  "genre-image": {
    scope: "genres",
    segment: "thumbnail",
    maxInputBytes: 8 * MB,
    maxWidth: 640,
    maxHeight: 640,
    webpQuality: 84,
  },
};

export const MAX_ASSET_SIZE_BYTES: Record<AssetKind, number> = {
  "comic-cover": ASSET_KIND_SPECS["comic-cover"].maxInputBytes,
  "comic-banner": ASSET_KIND_SPECS["comic-banner"].maxInputBytes,
  "category-image": ASSET_KIND_SPECS["category-image"].maxInputBytes,
  "genre-image": ASSET_KIND_SPECS["genre-image"].maxInputBytes,
};

export const CLIENT_DIRECT_UPLOAD_MAX_BYTES = 3_500_000;

export const MAX_UPLOAD_PAYLOAD_BYTES = 4_000_000;

export const ENTITY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ASSET_KIND_SPECS, value);
}

export function maxAssetSizeBytes(kind: AssetKind): number {
  return MAX_ASSET_SIZE_BYTES[kind];
}

export function buildPublicAssetKey(kind: AssetKind, ownerId: string, assetId: string, extension = "webp"): string {
  const spec = ASSET_KIND_SPECS[kind];
  return `public/${spec.scope}/${ownerId}/${spec.segment}/${assetId}.${extension}`;
}