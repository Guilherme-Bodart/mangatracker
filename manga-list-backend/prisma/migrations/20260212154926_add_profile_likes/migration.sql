-- CreateTable
CREATE TABLE "ProfileLike" (
    "id" TEXT NOT NULL,
    "likerId" TEXT NOT NULL,
    "likedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileLike_likedUserId_idx" ON "ProfileLike"("likedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileLike_likerId_likedUserId_key" ON "ProfileLike"("likerId", "likedUserId");

-- AddForeignKey
ALTER TABLE "ProfileLike" ADD CONSTRAINT "ProfileLike_likerId_fkey" FOREIGN KEY ("likerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileLike" ADD CONSTRAINT "ProfileLike_likedUserId_fkey" FOREIGN KEY ("likedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
