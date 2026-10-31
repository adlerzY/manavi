import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

export const getActiveEditionLanguages = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await prisma.edition.findMany({
      where: { status: "ACTIVE" },
      distinct: ["language"],
      select: { language: true },
      orderBy: { language: "asc" },
    });
    return rows.map((row) => row.language);
  },
  ["editions:active-languages"],
  { revalidate: 3600, tags: ["editions"] }
);