-- Uploads can live in Cloudflare R2 (storageKey) instead of the database.
-- Additive: a new optional column; existing rows keep their bytes.

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

