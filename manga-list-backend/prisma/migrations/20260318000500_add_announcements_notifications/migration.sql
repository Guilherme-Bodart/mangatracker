CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL,
  "title" TEXT,
  "message" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementRead" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key"
ON "AnnouncementRead"("announcementId", "userId");

CREATE INDEX "Announcement_isActive_createdAt_idx"
ON "Announcement"("isActive", "createdAt");

CREATE INDEX "AnnouncementRead_userId_readAt_idx"
ON "AnnouncementRead"("userId", "readAt");

ALTER TABLE "Announcement"
ADD CONSTRAINT "Announcement_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnnouncementRead"
ADD CONSTRAINT "AnnouncementRead_announcementId_fkey"
FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnouncementRead"
ADD CONSTRAINT "AnnouncementRead_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
