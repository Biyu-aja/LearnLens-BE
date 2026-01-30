-- AlterTable
ALTER TABLE "explore_comments" ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "mindMap" TEXT;

-- CreateTable
CREATE TABLE "study_plans" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_tasks" (
    "id" TEXT NOT NULL,
    "studyPlanId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "task" TEXT NOT NULL,
    "description" TEXT,
    "question" TEXT,
    "questionHint" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_plans_materialId_userId_key" ON "study_plans"("materialId", "userId");

-- AddForeignKey
ALTER TABLE "explore_comments" ADD CONSTRAINT "explore_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "explore_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_studyPlanId_fkey" FOREIGN KEY ("studyPlanId") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
