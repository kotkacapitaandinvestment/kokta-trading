-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "config" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "publicKey" TEXT,
ADD COLUMN     "secretCipher" TEXT,
ALTER COLUMN "apiKeyCipher" DROP NOT NULL,
ALTER COLUMN "model" DROP NOT NULL,
ALTER COLUMN "baseUrl" DROP NOT NULL;
