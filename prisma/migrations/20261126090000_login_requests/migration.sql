CREATE TYPE "LoginRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'CONSUMED');

CREATE TABLE "LoginRequest" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "status" "LoginRequestStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "deviceLabel" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginRequest_nonce_key" ON "LoginRequest"("nonce");
CREATE INDEX "LoginRequest_expiresAt_idx" ON "LoginRequest"("expiresAt");