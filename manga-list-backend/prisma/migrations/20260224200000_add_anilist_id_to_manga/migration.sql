ALTER TABLE "Manga"
ADD COLUMN "anilistId" INTEGER;

CREATE UNIQUE INDEX "Manga_anilistId_key"
ON "Manga"("anilistId");
