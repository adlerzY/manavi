const TEHRAN_OFFSET = "+03:30";
const DAY_MS = 24 * 60 * 60 * 1000;

function parseTehranDay(value?: string): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00${TEHRAN_OFFSET}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function tehranDateRange(from?: string, to?: string): { gte?: Date; lt?: Date } | undefined {
  const start = parseTehranDay(from);
  const end = parseTehranDay(to);
  if (!start && !end) return undefined;
  return {
    ...(start ? { gte: start } : {}),
    ...(end ? { lt: new Date(end.getTime() + DAY_MS) } : {}),
  };
}