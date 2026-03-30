ALTER TABLE "Announcement"
ADD COLUMN "titlePt" TEXT,
ADD COLUMN "titleEn" TEXT,
ADD COLUMN "messagePt" TEXT,
ADD COLUMN "messageEn" TEXT;

UPDATE "Announcement"
SET
  "titlePt" = COALESCE("titlePt", "title"),
  "messagePt" = COALESCE("messagePt", "message")
WHERE "messagePt" IS NULL;
