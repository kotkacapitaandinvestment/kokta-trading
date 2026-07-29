-- Data already backfilled into secretCipher/config by a one-off script before this migration ran.
ALTER TABLE "Integration" DROP COLUMN "apiKeyCipher",
DROP COLUMN "baseUrl",
DROP COLUMN "model";
