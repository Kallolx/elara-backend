-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "subcategories" TEXT[] DEFAULT ARRAY[]::TEXT[];
