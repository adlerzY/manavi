import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { notifyAdmin } from "@/lib/admin-alert";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

interface WorkflowRunPayload {
  action?: string;
  workflow_run?: {
    name?: string;
    conclusion?: string | null;
    run_number?: number;
    html_url?: string;
    head_branch?: string;
  };
  repository?: { full_name?: string };
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !WEBHOOK_SECRET) {
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
  }

  const rawBody = await req.text();

  if (WEBHOOK_SECRET) {
    const signature = req.headers.get("x-hub-signature-256");
    if (!verifySignature(rawBody, signature, WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if (req.headers.get("x-github-event") !== "workflow_run") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let payload: WorkflowRunPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const run = payload.workflow_run;
  if (!run || payload.action !== "completed") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (run.conclusion === "failure" || run.conclusion === "timed_out") {
    await notifyAdmin(
      `اجرای ورک‌فلو ناموفق بود — ${run.name ?? "workflow"}`,
      `مخزن: ${payload.repository?.full_name ?? "manavi"}\nشاخه: ${run.head_branch ?? "-"}\nشماره اجرا: ${run.run_number ?? "-"}\n${run.html_url ?? ""}`,
      "error"
    );
  }

  return NextResponse.json({ ok: true });
}