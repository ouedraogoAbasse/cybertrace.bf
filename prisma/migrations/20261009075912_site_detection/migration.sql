-- CreateEnum
CREATE TYPE "RiskVerdict" AS ENUM ('SURE', 'SUSPECTE', 'FRAUDULEUSE');

-- CreateTable
CREATE TABLE "SiteCheck" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlNormalisee" TEXT NOT NULL,
    "hote" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "verdict" "RiskVerdict" NOT NULL,
    "indicateurs" JSONB NOT NULL,
    "contenuAnalyse" BOOLEAN NOT NULL DEFAULT false,
    "dureeMs" INTEGER,
    "caseId" TEXT,
    "effectueParId" TEXT,
    "analyseLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteCheck_caseId_idx" ON "SiteCheck"("caseId");

-- AddForeignKey
ALTER TABLE "SiteCheck" ADD CONSTRAINT "SiteCheck_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCheck" ADD CONSTRAINT "SiteCheck_effectueParId_fkey" FOREIGN KEY ("effectueParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
