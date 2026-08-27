export type AssetKind = "comic-cover" | "comic-banner" | "category-image";

export const MAX_ASSET_SIZE_BYTES: Record<AssetKind, number> = {
  "comic-cover": 15 * 1024 * 1024,
  "comic-banner": 15 * 1024 * 1024,
  "category-image": 8 * 1024 * 1024,
};

export function maxAssetSizeBytes(kind: AssetKind): number {
  return MAX_ASSET_SIZE_BYTES[kind];
}