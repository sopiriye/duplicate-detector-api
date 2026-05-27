-- AlterTable
ALTER TABLE "merchants" ALTER COLUMN "business_email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "first_name" DROP NOT NULL,
ALTER COLUMN "last_name" DROP NOT NULL;
