import "server-only";
import type { ComicAccessMode, License } from "@prisma/client";
import { prisma } from "./prisma";
import { isLicenseCurrentlyActive } from "./license";

export async function resolveEditionLicense(
  publisherId: string,
  comic: { licenseId: string; accessMode: ComicAccessMode },
  via: "EXPLICIT" | "GLOBAL" | null
): Promise<License | null> {
  const all = await prisma.license.findMany({ where: { publisherId }, orderBy: { createdAt: "desc" } });
  const active = all.filter((license) => isLicenseCurrentlyActive(license));
  if (active.length === 0) return null;
  if (via === "GLOBAL") return active.find((license) => license.scope === "GLOBAL") ?? null;

  const wantedScope = comic.accessMode === "PERSONAL" ? "PERSONAL" : "STANDARD";
  return (
    active.find((license) => license.id === comic.licenseId) ??
    active.find((license) => license.scope === wantedScope) ??
    (comic.accessMode === "OPEN" ? active[0] : null)
  );
}