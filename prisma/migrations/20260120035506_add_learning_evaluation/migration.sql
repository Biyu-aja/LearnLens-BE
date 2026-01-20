-- AlterTable
ALTER TABLE "users" ADD COLUMN     "customModel" TEXT;

-- CreateTable
CREATE TABLE "learning_evaluations" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "questionsCount" INTEGER NOT NULL,
    "quizAvgScore" DOUBLE PRECISION,
    "materialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_evaluations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "learning_evaluations" ADD CONSTRAINT "learning_evaluations_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
