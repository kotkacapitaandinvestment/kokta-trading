-- Sign-up codes: a 6-digit code emailed before an account exists. Additive only.

-- CreateTable
CREATE TABLE "SignupCode" (
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupCode_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "SignupCode_expiresAt_idx" ON "SignupCode"("expiresAt");

