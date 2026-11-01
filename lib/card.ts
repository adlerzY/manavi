const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
}

export function normalizeCardNumber(raw: string): string {
  return toLatinDigits(raw).replace(/[\s-]/g, "");
}

export function isValidCardNumber(value: string): boolean {
  if (!/^\d{16}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i += 1) {
    let digit = Number(value[15 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function formatCardNumber(value: string): string {
  return value.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export function maskCardNumber(value: string): string {
  return value.length === 16 ? `${value.slice(0, 4)} •••• •••• ${value.slice(12)}` : value;
}

export function normalizeIban(raw: string): string {
  const cleaned = toLatinDigits(raw).replace(/[\s-]/g, "").toUpperCase();
  return /^\d{24}$/.test(cleaned) ? `IR${cleaned}` : cleaned;
}

export function isValidIban(value: string): boolean {
  if (!/^IR\d{24}$/.test(value)) return false;
  const rearranged = value.slice(4) + value.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = char >= "A" && char <= "Z" ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}