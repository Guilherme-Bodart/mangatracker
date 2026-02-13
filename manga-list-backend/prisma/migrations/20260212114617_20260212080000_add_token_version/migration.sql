-- AlterTable
ALTER TABLE "Manga" ADD COLUMN     "lastChapter" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "publicationStatus" TEXT;
