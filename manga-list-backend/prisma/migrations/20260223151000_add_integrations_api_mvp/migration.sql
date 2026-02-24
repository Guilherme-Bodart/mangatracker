-- CreateTable
CREATE TABLE "IntegrationPartner" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientSecretHash" TEXT NOT NULL,
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPartnerConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPartnerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalMangaMap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "externalMangaId" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalMangaMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEventLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "externalMangaId" TEXT NOT NULL,
    "chapter" INTEGER,
    "outcome" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationPartner_slug_key" ON "IntegrationPartner"("slug");

-- CreateIndex
CREATE INDEX "UserPartnerConnection_partnerId_idx" ON "UserPartnerConnection"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPartnerConnection_userId_partnerId_key" ON "UserPartnerConnection"("userId", "partnerId");

-- CreateIndex
CREATE INDEX "ExternalMangaMap_userId_mangaId_idx" ON "ExternalMangaMap"("userId", "mangaId");

-- CreateIndex
CREATE INDEX "ExternalMangaMap_partnerId_idx" ON "ExternalMangaMap"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalMangaMap_userId_partnerId_externalMangaId_key" ON "ExternalMangaMap"("userId", "partnerId", "externalMangaId");

-- CreateIndex
CREATE INDEX "SyncEventLog_partnerId_createdAt_idx" ON "SyncEventLog"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncEventLog_userId_createdAt_idx" ON "SyncEventLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncEventLog_userId_partnerId_externalMangaId_idx" ON "SyncEventLog"("userId", "partnerId", "externalMangaId");

-- AddForeignKey
ALTER TABLE "UserPartnerConnection" ADD CONSTRAINT "UserPartnerConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPartnerConnection" ADD CONSTRAINT "UserPartnerConnection_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "IntegrationPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMangaMap" ADD CONSTRAINT "ExternalMangaMap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMangaMap" ADD CONSTRAINT "ExternalMangaMap_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "IntegrationPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMangaMap" ADD CONSTRAINT "ExternalMangaMap_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "Manga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEventLog" ADD CONSTRAINT "SyncEventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEventLog" ADD CONSTRAINT "SyncEventLog_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "IntegrationPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
