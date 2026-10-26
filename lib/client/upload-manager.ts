"use client";

import { useCallback, useRef, useState } from "react";
import { requestPageUploadUrls } from "@/app/admin/actions/upload-urls";

export { MAX_PAGE_SIZE_BYTES } from "@/lib/page-limits";

const CONCURRENCY = 4;
const MAX_RETRIES_PER_ITEM = 3;
const IDLE_TIMEOUT_MS = 20_000;
const FIRST_PROGRESS_TIMEOUT_MS = 30_000;
const RESPONSE_TIMEOUT_MS = 30_000;

export type UploadItemStatus = "pending" | "uploading" | "done" | "error";

export interface UploadItem {
  index: number;
  name: string;
  contentType: string;
  blob: Blob;
  status: UploadItemStatus;
  progress: number;
  key: string | null;
  error: string | null;
}

interface QueueState {
  items: UploadItem[];
  isRunning: boolean;
  isComplete: boolean;
}

interface UploadTarget {
  key: string;
  uploadUrl: string;
}

class PutError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "PutError";
  }
}

function describePutError(err: unknown): string {
  if (err instanceof PutError) {
    if (err.status === 403) {
      return "دسترسی آپلود رد شد (۴۰۳) — لینک منقضی شده یا مجوز کلید/تنظیم CORS باکت مشکل دارد";
    }
    if (err.status) return `فضای ذخیره‌سازی خطای ${err.status} برگرداند`;
    return err.message;
  }
  return "خطای ناشناخته در آپلود";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function putWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clear();
      action();
    };

    const arm = (ms: number, message: string) => {
      clear();
      timer = setTimeout(() => {
        finish(() => reject(new PutError(message)));
        xhr.abort();
      }, ms);
    };

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);

    arm(FIRST_PROGRESS_TIMEOUT_MS, "اتصال به فضای ذخیره‌سازی برقرار نشد (بدون پاسخ) — اینترنت یا فیلترشکن را بررسی کنید");

    xhr.upload.onprogress = (event) => {
      arm(IDLE_TIMEOUT_MS, "ارسال فایل متوقف شد (بدون پیشرفت) — اینترنت یا فیلترشکن را بررسی کنید");
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.upload.onload = () => {
      onProgress(100);
      arm(RESPONSE_TIMEOUT_MS, "فضای ذخیره‌سازی بعد از دریافت فایل پاسخ نداد");
    };
    xhr.onload = () =>
      finish(() => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new PutError(`HTTP ${xhr.status}`, xhr.status));
      });
    xhr.onerror = () =>
      finish(() => reject(new PutError("خطای شبکه یا CORS هنگام ارسال فایل — اتصال و تنظیمات CORS باکت را بررسی کنید")));
    xhr.onabort = () => finish(() => reject(new PutError("آپلود لغو شد")));

    xhr.send(blob);
  });
}

export function useChapterUploadQueue() {
  const [state, setState] = useState<QueueState>({ items: [], isRunning: false, isComplete: false });
  const uploadIdRef = useRef<string | null>(null);
  const comicIdRef = useRef<string | null>(null);
  const runIdRef = useRef(0);

  const isCurrent = useCallback((runId: number) => runIdRef.current === runId, []);

  const updateItem = useCallback((runId: number, index: number, patch: Partial<UploadItem>) => {
    if (runIdRef.current !== runId) return;
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.index === index ? { ...item, ...patch } : item)),
    }));
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    uploadIdRef.current = null;
    comicIdRef.current = null;
    setState({ items: [], isRunning: false, isComplete: false });
  }, []);

  const uploadItem = useCallback(
    async (runId: number, comicId: string, uploadId: string, item: UploadItem, firstTarget: UploadTarget | undefined) => {
      let target = firstTarget;

      for (let attempt = 1; attempt <= MAX_RETRIES_PER_ITEM; attempt += 1) {
        if (!isCurrent(runId)) return;

        if (!target) {
          try {
            const refreshed = await requestPageUploadUrls({
              comicId,
              uploadId,
              files: [{ index: item.index, contentType: item.contentType }],
            });
            const next = refreshed.data?.items[0];
            if (!refreshed.success || !next) {
              updateItem(runId, item.index, { status: "error", error: refreshed.error ?? "دریافت لینک آپلود ناموفق بود" });
              return;
            }
            target = next;
          } catch {
            if (attempt >= MAX_RETRIES_PER_ITEM) {
              updateItem(runId, item.index, { status: "error", error: "ارتباط با سرور برای دریافت لینک آپلود برقرار نشد" });
              return;
            }
            await delay(500 * attempt);
            continue;
          }
        }

        updateItem(runId, item.index, { status: "uploading", error: null, progress: 0 });

        try {
          await putWithProgress(target.uploadUrl, item.blob, item.contentType, (pct) =>
            updateItem(runId, item.index, { progress: pct })
          );
          updateItem(runId, item.index, { status: "done", progress: 100, key: target.key, error: null });
          return;
        } catch (err) {
          if (attempt >= MAX_RETRIES_PER_ITEM) {
            updateItem(runId, item.index, { status: "error", error: describePutError(err) });
            return;
          }
          target = undefined;
          await delay(500 * attempt);
        }
      }
    },
    [isCurrent, updateItem]
  );

  const runPool = useCallback(
    async (runId: number, list: UploadItem[], targets: Map<number, UploadTarget>, comicId: string, uploadId: string) => {
      const queue = [...list];
      const worker = async () => {
        while (queue.length > 0) {
          if (!isCurrent(runId)) return;
          const item = queue.shift();
          if (!item) return;
          await uploadItem(runId, comicId, uploadId, item, targets.get(item.index));
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker()));
    },
    [isCurrent, uploadItem]
  );

  const start = useCallback(
    async (comicId: string, files: { name: string; contentType: string; blob: Blob }[]) => {
      const runId = ++runIdRef.current;
      const uploadId = crypto.randomUUID();
      uploadIdRef.current = uploadId;
      comicIdRef.current = comicId;

      const initialItems: UploadItem[] = files.map((file, index) => ({
        index,
        name: file.name,
        contentType: file.contentType,
        blob: file.blob,
        status: "pending",
        progress: 0,
        key: null,
        error: null,
      }));

      setState({ items: initialItems, isRunning: true, isComplete: false });

      let urlResult: Awaited<ReturnType<typeof requestPageUploadUrls>>;
      try {
        urlResult = await requestPageUploadUrls({
          comicId,
          uploadId,
          files: initialItems.map((item) => ({ index: item.index, contentType: item.contentType })),
        });
      } catch {
        urlResult = { success: false, error: "ارتباط با سرور برقرار نشد — دوباره تلاش کنید" };
      }

      if (!isCurrent(runId)) return;

      if (!urlResult.success || !urlResult.data) {
        const message = urlResult.error ?? "خطا در آماده‌سازی آپلود";
        setState((prev) => ({
          ...prev,
          isRunning: false,
          items: prev.items.map((item) => ({ ...item, status: "error", error: message })),
        }));
        return;
      }

      const targets = new Map(urlResult.data.items.map((item) => [item.index, { key: item.key, uploadUrl: item.uploadUrl }]));

      await runPool(runId, initialItems, targets, comicId, uploadId);

      if (!isCurrent(runId)) return;
      setState((prev) => ({ ...prev, isRunning: false, isComplete: prev.items.every((i) => i.status === "done") }));
    },
    [isCurrent, runPool]
  );

  const retryFailed = useCallback(async () => {
    const comicId = comicIdRef.current;
    const uploadId = uploadIdRef.current;
    if (!comicId || !uploadId) return;

    const failedItems = state.items.filter((item) => item.status === "error");
    if (failedItems.length === 0) return;

    const runId = runIdRef.current;
    setState((prev) => ({ ...prev, isRunning: true, isComplete: false }));

    await runPool(runId, failedItems, new Map(), comicId, uploadId);

    if (!isCurrent(runId)) return;
    setState((prev) => ({ ...prev, isRunning: false, isComplete: prev.items.every((i) => i.status === "done") }));
  }, [state.items, runPool, isCurrent]);

  const orderedKeys = useCallback((): string[] | null => {
    if (state.items.length === 0) return null;
    const sorted = [...state.items].sort((a, b) => a.index - b.index);
    if (!sorted.every((item) => item.status === "done" && item.key)) return null;
    return sorted.map((item) => item.key as string);
  }, [state.items]);

  return {
    items: state.items,
    isRunning: state.isRunning,
    isComplete: state.isComplete,
    start,
    retryFailed,
    reset,
    orderedKeys,
  };
}