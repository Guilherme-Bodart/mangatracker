-- CreateEnum
CREATE TYPE "MangaStatus" AS ENUM ('READING', 'COMPLETED', 'PLAN_TO_READ', 'DROPPED');

-- CreateTable
CREATE TABLE "Manga" (
    "id" TEXT NOT NULL,
    "malId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "coverImage" TEXT,
    "author" TEXT,
    "genres" TEXT[],
    "totalChapters" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserManga" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "status" "MangaStatus" NOT NULL,
    "rating" DOUBLE PRECISION,
    "currentChapter" INTEGER,
    "notes" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserManga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Manga_malId_key" ON "Manga"("malId");

-- CreateIndex
CREATE UNIQUE INDEX "UserManga_userId_mangaId_key" ON "UserManga"("userId", "mangaId");

-- AddForeignKey
ALTER TABLE "UserManga" ADD CONSTRAINT "UserManga_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserManga" ADD CONSTRAINT "UserManga_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "Manga"("id") ON DELETE CASCADE ON UPDATE CASCADE;
