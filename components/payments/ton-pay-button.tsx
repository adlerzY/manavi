"use client";

import { useEffect, useRef, useState } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { verifyTonPayment, type TonPaymentRequest } from "@/app/actions/ton-payments";

const VERIFY_POLL_INTERVAL_MS = 3000;
const VERIFY_MAX_ATTEMPTS = 20;

interface TonPayButtonProps {
  label: string;
  disabled?: boolean;
  className?: string;
  successMessage?: string;
  createPayment: (walletAddress: string) => Promise<{ success: boolean; error?: string; data?: TonPaymentRequest }>;
  onPaid?: () => void;
}

type Status = "idle" | "creating" | "awaiting-wallet" | "verifying" | "error" | "done";

export function TonPayButton({
  label,
  disabled,
  className,
  successMessage = "پرداخت با موفقیت تایید شد",
  createPayment,
  onPaid,
}: TonPayButtonProps) {
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = useTonAddress();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const paidCalledRef = useRef(false);
  const pendingTransactionIdRef = useRef<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  async function pollVerification(transactionId: string) {
    pendingTransactionIdRef.current = transactionId;
    setTimedOut(false);
    for (let attempt = 0; attempt < VERIFY_MAX_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, VERIFY_POLL_INTERVAL_MS));
      if (cancelledRef.current) return;

      const result = await verifyTonPayment(transactionId);
      if (cancelledRef.current) return;

      if (!result.success) {
        setStatus("error");
        setError(result.error ?? "خطا در تایید تراکنش");
        return;
      }
      if (result.data?.status === "PAID") {
        pendingTransactionIdRef.current = null;
        setStatus("done");
        if (!paidCalledRef.current) {
          paidCalledRef.current = true;
          onPaid?.();
        }
        return;
      }
      if (result.data?.status === "FAILED") {
        pendingTransactionIdRef.current = null;
        setStatus("error");
        setError("پرداخت ناموفق بود. اگر مبلغی از کیف پول شما کسر شده، با پشتیبانی تماس بگیرید.");
        return;
      }
    }
    if (!cancelledRef.current) {
      setStatus("error");
      setTimedOut(true);
      setError("تایید تراکنش زمان زیادی طول کشید — اگر مبلغ از کیف پولت کسر شده، دکمه‌ی «بررسی دوباره» را بزن");
    }
  }

  async function handleRecheck() {
    const transactionId = pendingTransactionIdRef.current;
    if (!transactionId) return;
    setError(null);
    setStatus("verifying");
    await pollVerification(transactionId);
  }

  async function handleClick() {
    setError(null);
    paidCalledRef.current = false;
    if (!walletAddress) {
      try {
        await tonConnectUI.openModal();
      } catch {}
      return;
    }

    setStatus("creating");
    const result = await createPayment(walletAddress);
    if (!result.success || !result.data) {
      setStatus("error");
      setError(result.error ?? "خطا در ایجاد تراکنش");
      return;
    }

    setStatus("awaiting-wallet");
    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: result.data.jettonWalletAddress,
            amount: result.data.amountNanotons,
            payload: result.data.payloadBase64,
          },
        ],
      });
    } catch {
      setStatus("idle");
      return;
    }

    setStatus("verifying");
    await pollVerification(result.data.transactionId);
  }

  const busy = status === "creating" || status === "awaiting-wallet" || status === "verifying";

  const statusNote =
    status === "creating"
      ? "در حال آماده‌سازی تراکنش…"
      : status === "awaiting-wallet"
      ? "تراکنش را در اپ کیف پول تایید کنید."
      : status === "verifying"
      ? "در انتظار تایید تراکنش روی شبکه؛ چند لحظه صبر کنید."
      : null;

  return (
    <div className="space-y-1.5">
      <button
        onClick={handleClick}
        disabled={disabled || busy}
        className={className ?? "min-h-11 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"}
      >
        {!walletAddress && "اتصال کیف پول تون"}
        {walletAddress && status === "creating" && "در حال آماده‌سازی…"}
        {walletAddress && status === "awaiting-wallet" && "در انتظار تایید در کیف پول…"}
        {walletAddress && status === "verifying" && "در حال تایید تراکنش…"}
        {walletAddress && (status === "idle" || status === "error" || status === "done") && label}
      </button>
      {statusNote && <p className="text-center text-xs text-text-muted">{statusNote}</p>}
      {status === "done" && <p className="text-center text-xs text-primary">{successMessage}</p>}
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
      {timedOut && status === "error" && (
        <button
          onClick={handleRecheck}
          className="min-h-11 w-full rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary"
        >
          بررسی دوباره
        </button>
      )}
    </div>
  );
}