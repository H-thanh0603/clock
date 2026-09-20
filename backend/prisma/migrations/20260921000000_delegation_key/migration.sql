-- CreateTable: bản ghi refresh cho vé delegation (dùng 1 lần, rotate)
CREATE TABLE "DelegationKey" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelegationKey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "DelegationKey_userId_idx" ON "DelegationKey"("userId");

-- AddForeignKey
ALTER TABLE "DelegationKey" ADD CONSTRAINT "DelegationKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
