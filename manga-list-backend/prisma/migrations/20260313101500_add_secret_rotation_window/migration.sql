-- Add previous secret transition window support for integration partners
ALTER TABLE "IntegrationPartner"
ADD COLUMN "previousClientSecretHash" TEXT,
ADD COLUMN "previousClientSecretExpiresAt" TIMESTAMP(3);

-- Audit table for secret version usage during exchange
CREATE TYPE "IntegrationPartnerSecretVersion" AS ENUM ('ACTIVE', 'PREVIOUS');

CREATE TABLE "IntegrationSecretUsageLog" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "secretVersion" "IntegrationPartnerSecretVersion" NOT NULL,
  "sourceDomain" TEXT,
  "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationSecretUsageLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "IntegrationSecretUsageLog"
ADD CONSTRAINT "IntegrationSecretUsageLog_partnerId_fkey"
FOREIGN KEY ("partnerId") REFERENCES "IntegrationPartner"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "IntegrationSecretUsageLog_partnerId_usedAt_idx"
ON "IntegrationSecretUsageLog"("partnerId", "usedAt");

CREATE INDEX "IntegrationSecretUsageLog_partnerId_secretVersion_usedAt_idx"
ON "IntegrationSecretUsageLog"("partnerId", "secretVersion", "usedAt");
