-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "forkedFromId" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "maxContext" SET DEFAULT 200000;

-- CreateTable
CREATE TABLE "explore_contents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "type" TEXT NOT NULL,
    "forksCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "originalMaterialId" TEXT NOT NULL,

    CONSTRAINT "explore_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "explore_likes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exploreContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explore_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "explore_comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exploreContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "explore_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "explore_dislikes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exploreContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explore_dislikes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_likes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "explore_contents_originalMaterialId_key" ON "explore_contents"("originalMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "explore_likes_userId_exploreContentId_key" ON "explore_likes"("userId", "exploreContentId");

-- CreateIndex
CREATE UNIQUE INDEX "explore_dislikes_userId_exploreContentId_key" ON "explore_dislikes"("userId", "exploreContentId");

-- CreateIndex
CREATE UNIQUE INDEX "material_likes_userId_materialId_key" ON "material_likes"("userId", "materialId");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explore_contents" ADD CONSTRAINT "explore_contents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explore_contents" ADD CONSTRAINT "explore_contents_originalMaterialId_fkey" FOREIGN KEY ("originalMaterialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explore_likes" ADD CONSTRAINT "explore_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explore_likes" ADD CONSTRAINT "explore_likes_exploreContentId_fkey" FOREIGN KEY ("exploreContentId") REFERENCES "explore_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explore_comments" ADD CONSTRAINT "explore_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explore_comments" ADD CONSTRAINT "explore_comments_exploreContentId_fkey" FOREIGN KEY ("exploreContentId") REFERENCES "explore_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explore_dislikes" ADD CONSTRAINT "explore_dislikes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explore_dislikes" ADD CONSTRAINT "explore_dislikes_exploreContentId_fkey" FOREIGN KEY ("exploreContentId") REFERENCES "explore_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_likes" ADD CONSTRAINT "material_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_likes" ADD CONSTRAINT "material_likes_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
