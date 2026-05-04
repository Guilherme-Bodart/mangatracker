ALTER TABLE "IntegrationPartner"
ADD COLUMN "parserMode" TEXT,
ADD COLUMN "parserTitleSelectors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "parserChapterSelectors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
