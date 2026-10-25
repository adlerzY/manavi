import "server-only";
import { prisma } from "./prisma";

export const PLATFORM_PUBLISHER_ID = "platform-internal-publisher";
export const PLATFORM_LICENSE_ID = "platform-internal-license";
export const PLATFORM_LICENSE_LABEL = "محتوای اختصاصی ماناوی (بدون ناشر)";

export interface LicenseSelectOption {
  id: string;
  publisherName: string;
  territory: string[];
  status: string;
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002");
}

export async function ensurePlatformLicense(): Promise<string> {
  const existing = await prisma.license.findUnique({ where: { id: PLATFORM_LICENSE_ID }, select: { id: true } });
  if (existing) return existing.id;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.publisher.upsert({
        where: { id: PLATFORM_PUBLISHER_ID },
        update: {},
        create: {
          id: PLATFORM_PUBLISHER_ID,
          name: "ماناوی",
          legalEntity: "PLATFORM_INTERNAL",
          contactEmail: "",
          isVerified: true,
        },
      });
      await tx.license.create({
        data: {
          id: PLATFORM_LICENSE_ID,
          publisherId: PLATFORM_PUBLISHER_ID,
          territory: ["GLOBAL"],
          royaltyPercentage: 0,
          status: "ACTIVE",
          startDate: new Date("2024-01-01T00:00:00.000Z"),
          contractReference: "PLATFORM_INTERNAL",
        },
      });
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  return PLATFORM_LICENSE_ID;
}

export function buildLicenseOptions(
  licenses: { id: string; status: string; territory: string[]; publisher: { name: string } }[]
): LicenseSelectOption[] {
  const real = licenses
    .filter((license) => license.id !== PLATFORM_LICENSE_ID)
    .map((license) => ({
      id: license.id,
      publisherName: license.publisher.name,
      territory: license.territory,
      status: license.status,
    }));

  return [{ id: PLATFORM_LICENSE_ID, publisherName: PLATFORM_LICENSE_LABEL, territory: ["GLOBAL"], status: "ACTIVE" }, ...real];
}