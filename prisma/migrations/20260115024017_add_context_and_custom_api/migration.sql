-- AlterTable
ALTER TABLE "users" ADD COLUMN     "customApiKey" TEXT,
ADD COLUMN     "customApiUrl" TEXT,
ADD COLUMN     "maxContext" INTEGER NOT NULL DEFAULT 8000;
