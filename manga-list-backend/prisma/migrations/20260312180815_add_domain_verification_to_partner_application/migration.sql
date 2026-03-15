-- CreateEnum
CREATE TYPE "DomainVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- AlterTable
ALTER TABLE "IntegrationPartnerApplication" ADD COLUMN     "domainVerificationError" TEXT,
ADD COLUMN     "domainVerificationLastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "domainVerificationStatus" "DomainVerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "domainVerificationToken" TEXT,
ADD COLUMN     "domainVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "verificationDomain" TEXT;

-- CreateIndex
CREATE INDEX "IntegrationPartnerApplication_domainVerificationStatus_crea_idx" ON "IntegrationPartnerApplication"("domainVerificationStatus", "createdAt");
