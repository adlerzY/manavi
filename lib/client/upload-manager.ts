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

type PutFailureKind = "http" | "network" | "timeout" | "abort";
type PutPhase = "connecting" | "uploading" | "waiting_response";

interface PutFailureDetails {
  kind: PutFailureKind;
  phase: PutPhase;
  targetHost: string;
  status: number;
  statusText: string;
  responseCode?: string;
  responseMessage?: string;
  uploadedBytes: number;
  totalBytes: number;
  progress: number;
  elapsedMs: number;
  readyState: number;
  online: boolean | null;
  timeoutStage?: "connect" | "upload" | "response";
}

class PutError extends Error {
  constructor(public readonly details: PutFailureDetails) {
    super(details.kind);
    this.name = "PutError";
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCodePoint(parseInt(n, 16))
    );
}

function readXmlTag(xml: string, tag: string): string | undefined {
  const match = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,
    "i"
  ).exec(xml);

  return match?.[1] ? decodeXml(match[1]).trim().slice(0, 400) : undefined;
}

function describePutError(err: unknown): string {
  if (!(err instanceof PutError)) {
    return "خطای ناشناخته در آپلود فایل";
  }

  const d = err.details;
  const hints: Record<string, string> = {
    AccessDenied: "دسترسی نوشتن در باکت رد شده است.",
    SignatureDoesNotMatch: "امضای لینک یا هدرهای درخواست با اطلاعات امضاشده تطابق ندارد.",
    InvalidAccessKeyId: "شناسه کلید دسترسی معتبر نیست.",
    NoSuchBucket: "نام باکت یا مقصد درخواست اشتباه است.",
    AuthorizationHeaderMalformed: "تنظیمات منطقه یا امضای درخواست ناسازگار است.",
    RequestTimeTooSkewed: "اختلاف ساعت یا اعتبار زمانی درخواست مشکل دارد.",
    ExpiredToken: "اعتبار دسترسی منقضی شده است.",
    EntityTooLarge: "حجم فایل از محدودیت فضای ذخیره‌سازی بیشتر است.",
    BadDigest: "بررسی صحت فایل ارسالی ناموفق بود.",
  };

  if (d.kind === "http") {
    const lines = [
      `خطای HTTP ${d.status} از فضای ذخیره‌سازی`,
      `Status: ${d.statusText || "Unknown"}`,
      `Host: ${d.targetHost}`,
      `Phase: ${d.phase}`,
      `Progress: ${d.progress}% (${d.uploadedBytes}/${d.totalBytes} bytes)`,
      `Duration: ${d.elapsedMs}ms`,
    ];

    if (d.responseCode) lines.push(`Code: ${d.responseCode}`);
    if (d.responseMessage) lines.push(`Message: ${d.responseMessage}`);
    if (d.responseCode && hints[d.responseCode]) {
      lines.push(`توضیح: ${hints[d.responseCode]}`);
    }

    return lines.join("\n");
  }

  if (d.kind === "network") {
    let diagnosis: string;

    if (d.phase === "connecting") {
      diagnosis =
        "ارسال فایل هنوز شروع نشده است. احتمال CORS Preflight، DNS، TLS یا قطع ارتباط با Endpoint وجود دارد.";
    } else if (d.phase === "uploading") {
      diagnosis =
        "ارتباط هنگام ارسال بدنه فایل قطع شده است. احتمال مشکل شبکه یا ارتباط با Endpoint وجود دارد.";
    } else {
      diagnosis =
        "فایل ارسال شده اما مرورگر پاسخ قابل‌خواندن دریافت نکرده است. CORS در پاسخ PUT یا قطع ارتباط پس از آپلود محتمل است.";
    }

    return [
      "خطای شبکه (HTTP Status: 0)",
      diagnosis,
      `Host: ${d.targetHost}`,
      `Phase: ${d.phase}`,
      `Progress: ${d.progress}% (${d.uploadedBytes}/${d.totalBytes} bytes)`,
      `ReadyState: ${d.readyState}`,
      `Browser online: ${d.online === null ? "Unknown" : d.online}`,
      `Duration: ${d.elapsedMs}ms`,
    ].join("\n");
  }

  if (d.kind === "timeout") {
    const messages = {
      connect: "اتصال یا شروع درخواست در زمان مجاز انجام نشد.",
      upload: "ارسال فایل متوقف شد و پیشرفتی نداشت.",
      response: "فایل ارسال شد اما پاسخ فضای ذخیره‌سازی دریافت نشد.",
    };

    return [
      "خطای Timeout",
      messages[d.timeoutStage ?? "connect"],
      `Host: ${d.targetHost}`,
      `Phase: ${d.phase}`,
      `Progress: ${d.progress}% (${d.uploadedBytes}/${d.totalBytes} bytes)`,
      `Duration: ${d.elapsedMs}ms`,
    ].join("\n");
  }

  return [
    "آپلود لغو شد",
    `Host: ${d.targetHost}`,
    `Phase: ${d.phase}`,
    `Progress: ${d.progress}%`,
  ].join("\n");
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
    let phase: PutPhase = "connecting";
    let uploadedBytes = 0;
    const startedAt = Date.now();

    let targetHost = "unknown";
    try {
      targetHost = new URL(url).host;
    } catch {
      targetHost = "invalid-url";
    }

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

    const snapshot = (
      kind: PutFailureKind,
      timeoutStage?: PutFailureDetails["timeoutStage"]
    ): PutFailureDetails => ({
      kind,
      phase,
      targetHost,
      status: xhr.status || 0,
      statusText: xhr.statusText || "",
      uploadedBytes,
      totalBytes: blob.size,
      progress:
        blob.size > 0
          ? Math.min(100, Math.round((uploadedBytes / blob.size) * 100))
          : 0,
      elapsedMs: Date.now() - startedAt,
      readyState: xhr.readyState,
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      timeoutStage,
    });

    const arm = (
      ms: number,
      stage: NonNullable<PutFailureDetails["timeoutStage"]>
    ) => {
      clear();
      timer = setTimeout(() => {
        finish(() => reject(new PutError(snapshot("timeout", stage))));
        xhr.abort();
      }, ms);
    };

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    arm(FIRST_PROGRESS_TIMEOUT_MS, "connect");

    xhr.upload.onloadstart = () => {
      phase = "uploading";
      arm(IDLE_TIMEOUT_MS, "upload");
    };

    xhr.upload.onprogress = (event) => {
      uploadedBytes = event.loaded;
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
      arm(IDLE_TIMEOUT_MS, "upload");
    };

    xhr.upload.onload = () => {
      uploadedBytes = blob.size;
      phase = "waiting_response";
      onProgress(100);
      arm(RESPONSE_TIMEOUT_MS, "response");
    };

    xhr.onload = () => {
      finish(() => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }

        const body = xhr.responseText || "";
        let responseCode: string | undefined = readXmlTag(body, "Code");
        let responseMessage: string | undefined = readXmlTag(body, "Message");

        if (body.trim().startsWith("{")) {
          try {
            const json = JSON.parse(body) as {
              code?: unknown;
              Code?: unknown;
              message?: unknown;
              Message?: unknown;
            };
            if (typeof json.code === "string") responseCode ??= json.code;
            if (typeof json.Code === "string") responseCode ??= json.Code;
            if (typeof json.message === "string") responseMessage ??= json.message;
            if (typeof json.Message === "string") responseMessage ??= json.Message;
          } catch {
          }
        }

        reject(
          new PutError({
            ...snapshot("http"),
            responseCode,
            responseMessage,
          })
        );
      });
    };

    xhr.onerror = () => {
      finish(() => reject(new PutError(snapshot("network"))));
    };

    xhr.ontimeout = () => {
      const stage =
        phase === "waiting_response"
          ? "response"
          : phase === "uploading"
            ? "upload"
            : "connect";
      finish(() => reject(new PutError(snapshot("timeout", stage))));
    };

    xhr.onabort = () => {
      finish(() => reject(new PutError(snapshot("abort"))));
    };

    xhr.timeout = 120_000;
    xhr.send(blob);
  });
}

export function useChapterUploadQueue() {
  const [state, setState] = useState<QueueState>({
    items: [],
    isRunning: false,
    isComplete: false,
  });
  const uploadIdRef = useRef<string | null>(null);
  const comicIdRef = useRef<string | null>(null);
  const runIdRef = useRef(0);

  const isCurrent = useCallback((runId: number) => runIdRef.current === runId, []);

  const updateItem = useCallback(
    (runId: number, index: number, patch: Partial<UploadItem>) => {
      if (runIdRef.current !== runId) return;
      setState((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.index === index ? { ...item, ...patch } : item
        ),
      }));
    },
    []
  );

  const reset = useCallback(() => {
    runIdRef.current += 1;
    uploadIdRef.current = null;
    comicIdRef.current = null;
    setState({ items: [], isRunning: false, isComplete: false });
  }, []);

  const uploadItem = useCallback(
    async (
      runId: number,
      comicId: string,
      uploadId: string,
      item: UploadItem,
      firstTarget: UploadTarget | undefined
    ) => {
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
              updateItem(runId, item.index, {
                status: "error",
                error: refreshed.error ?? "دریافت لینک آپلود ناموفق بود",
              });
              return;
            }
            target = next;
          } catch {
            if (attempt >= MAX_RETRIES_PER_ITEM) {
              updateItem(runId, item.index, {
                status: "error",
                error: "ارتباط با سرور برای دریافت لینک آپلود برقرار نشد",
              });
              return;
            }
            await delay(500 * attempt);
            continue;
          }
        }

        updateItem(runId, item.index, {
          status: "uploading",
          error: null,
          progress: 0,
        });

        try {
          await putWithProgress(target.uploadUrl, item.blob, item.contentType, (pct) =>
            updateItem(runId, item.index, { progress: pct })
          );
          updateItem(runId, item.index, {
            status: "done",
            progress: 100,
            key: target.key,
            error: null,
          });
          return;
        } catch (err) {
          const permanentHttpError =
            err instanceof PutError &&
            err.details.kind === "http" &&
            err.details.status >= 400 &&
            err.details.status < 500 &&
            err.details.status !== 408 &&
            err.details.status !== 429;

          if (permanentHttpError || attempt >= MAX_RETRIES_PER_ITEM) {
            updateItem(runId, item.index, {
              status: "error",
              error: describePutError(err),
            });
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
    async (
      runId: number,
      list: UploadItem[],
      targets: Map<number, UploadTarget>,
      comicId: string,
      uploadId: string
    ) => {
      const queue = [...list];
      const worker = async () => {
        while (queue.length > 0) {
          if (!isCurrent(runId)) return;
          const item = queue.shift();
          if (!item) return;
          await uploadItem(runId, comicId, uploadId, item, targets.get(item.index));
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker())
      );
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
          files: initialItems.map((item) => ({
            index: item.index,
            contentType: item.contentType,
          })),
        });
      } catch {
        urlResult = {
          success: false,
          error: "ارتباط با سرور برقرار نشد — دوباره تلاش کنید",
        };
      }

      if (!isCurrent(runId)) return;

      if (!urlResult.success || !urlResult.data) {
        const message = urlResult.error ?? "خطا در آماده‌سازی آپلود";
        setState((prev) => ({
          ...prev,
          isRunning: false,
          items: prev.items.map((item) => ({
            ...item,
            status: "error",
            error: message,
          })),
        }));
        return;
      }

      const targets = new Map(
        urlResult.data.items.map((item) => [
          item.index,
          { key: item.key, uploadUrl: item.uploadUrl },
        ])
      );

      await runPool(runId, initialItems, targets, comicId, uploadId);

      if (!isCurrent(runId)) return;
      setState((prev) => ({
        ...prev,
        isRunning: false,
        isComplete: prev.items.every((item) => item.status === "done"),
      }));
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
    setState((prev) => ({
      ...prev,
      isRunning: false,
      isComplete: prev.items.every((item) => item.status === "done"),
    }));
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
