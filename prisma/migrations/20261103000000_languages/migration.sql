CREATE TABLE "Language" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Language_pkey" PRIMARY KEY ("code")
);
CREATE UNIQUE INDEX "Language_single_default_key" ON "Language"("isDefault") WHERE "isDefault" = true;

INSERT INTO "Language" ("code", "label", "isActive", "isDefault", "sortOrder", "updatedAt") VALUES
  ('fa', 'فارسی', true, true, 0, CURRENT_TIMESTAMP),
  ('en', 'انگلیسی', true, false, 1, CURRENT_TIMESTAMP),
  ('ar', 'عربی', true, false, 2, CURRENT_TIMESTAMP),
  ('tr', 'ترکی', true, false, 3, CURRENT_TIMESTAMP),
  ('ja', 'ژاپنی', true, false, 4, CURRENT_TIMESTAMP),
  ('ko', 'کره‌ای', true, false, 5, CURRENT_TIMESTAMP);

INSERT INTO "Language" ("code", "label", "isActive", "sortOrder", "updatedAt")
SELECT DISTINCT e."language", upper(e."language"), true, 100, CURRENT_TIMESTAMP
FROM "Edition" e
WHERE NOT EXISTS (SELECT 1 FROM "Language" l WHERE l."code" = e."language");