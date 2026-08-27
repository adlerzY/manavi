"use server";

import { requireAdmin, requireComicManageAccessByComicId, getSessionUser, getPublisherContext } from "@/lib/auth";
import { buildAssetKey, createAssetPresignedPutUrl, isAllowedAssetContentType, assetPublicUrl } from "@/lib/s3";
import { safeError } from "@/lib/errors";
import { MAX_ASSET_SIZE_BYTES, type AssetKind } from "@/lib/asset-kinds";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface AssetUploadTarget {
  uploadUrl: string;
  publicUrl: string;
}

async function assertKindAccess(kind: AssetKind, ownerId: string | null): Promise<void> {
  if (kind === "comic-cover" || kind === "comic-banner") {
    if (ownerId) {
      await requireComicManageAccessByComicId(ownerId);
      return;
    }
    const user = await getSessionUser();
    if (!user) throw new Error("Not authenticated");
    if (user.isBanned) throw new Error("Account is banned");
    if (user.role === "ADMIN") return;
    const context = await getPublisherContext(user);
    if (!context?.canManageComics) throw new Error("دسترسی غیرمجاز");
    return;
  }

  await requireAdmin();
}

export async function requestAssetUploadUrl(input: {
  kind: AssetKind;
  ownerId: string | null;
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<AssetUploadTarget>> {
  try {
    if (!(input.kind in MAX_ASSET_SIZE_BYTES)) {
      return { success: false, error: "نوع دارایی نامعتبر است" };
    }
    if (!isAllowedAssetContentType(input.contentType)) {
      return { success: false, error: `فرمت فایل پشتیبانی نمی‌شود: ${input.contentType}` };
    }
    const maxSize = MAX_ASSET_SIZE_BYTES[input.kind];
    if (input.sizeBytes > maxSize) {
      return { success: false, error: `حجم فایل نباید بیش از ${Math.round(maxSize / 1024 / 1024)} مگابایت باشد` };
    }

    await assertKindAccess(input.kind, input.ownerId);

    const key = buildAssetKey(input.kind, input.ownerId, input.contentType);
    const uploadUrl = await createAssetPresignedPutUrl(key, input.contentType);
    const publicUrl = assetPublicUrl(key);

    return { success: true, data: { uploadUrl, publicUrl } };
  } catch (err) {
    return safeError(err);
  }
}