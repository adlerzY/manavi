import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

export const LANGUAGES_TAG = "languages";

export interface LanguageRecord {
  code: string;
  label: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export const getAllLanguages = unstable_cache(
  async (): Promise<LanguageRecord[]> =>
    prisma.language.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: { code: true, label: true, isActive: true, isDefault: true, sortOrder: true },
    }),
  ["languages:all"],
  { revalidate: 3600, tags: [LANGUAGES_TAG] }
);

export async function getActiveLanguages(): Promise<LanguageRecord[]> {
  return (await getAllLanguages()).filter((language) => language.isActive);
}

export async function getLanguageLabels(): Promise<Record<string, string>> {
  return Object.fromEntries((await getAllLanguages()).map((language) => [language.code, language.label]));
}

export async function getDefaultLanguageCode(): Promise<string> {
  const languages = await getAllLanguages();
  return languages.find((language) => language.isDefault)?.code ?? languages.find((language) => language.isActive)?.code ?? "fa";
}

export async function isValidLanguage(code: string, options?: { activeOnly?: boolean }): Promise<boolean> {
  const found = (await getAllLanguages()).find((language) => language.code === code);
  if (!found) return false;
  return options?.activeOnly === false ? true : found.isActive;
}