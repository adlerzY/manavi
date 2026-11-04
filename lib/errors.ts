import "server-only";
import { AccessDeniedError } from "./access";

export interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export function safeError<T = undefined>(
  err: unknown,
  publicMessage = "خطایی رخ داد، دوباره تلاش کنید"
): ActionResult<T> {
  if (err instanceof AccessDeniedError) return { success: false, error: err.message };
  console.error(err);
  return { success: false, error: publicMessage };
}