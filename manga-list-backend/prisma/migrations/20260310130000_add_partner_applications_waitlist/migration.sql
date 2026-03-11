-- CreateEnum
CREATE TYPE "IntegrationPartnerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "IntegrationPartnerApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requestedSlug" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "useCase" TEXT,
    "status" "IntegrationPartnerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewReason" TEXT,
    "approvedPartnerId" TEXT,
    "reviewedByEmail" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationPartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationPartnerApplication_status_createdAt_idx" ON "IntegrationPartnerApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationPartnerApplication_requestedSlug_idx" ON "IntegrationPartnerApplication"("requestedSlug");

-- CreateIndex
CREATE INDEX "IntegrationPartnerApplication_contactEmail_createdAt_idx" ON "IntegrationPartnerApplication"("contactEmail", "createdAt");
