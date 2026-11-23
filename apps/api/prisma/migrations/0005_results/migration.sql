-- الجلسة 4: النتائج والاعتراضات — صورة ورقة المباراة، أصوات لجنة الانضباط بالنتيجة المقترحة، قرار الاعتراض

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "sheet_media_id" INTEGER;

-- AlterTable
ALTER TABLE "disputes" ADD COLUMN     "decision" TEXT;

-- AlterTable
ALTER TABLE "dispute_votes" ADD COLUMN     "away_pens" INTEGER,
ADD COLUMN     "away_score" INTEGER,
ADD COLUMN     "decision" TEXT NOT NULL,
ADD COLUMN     "home_pens" INTEGER,
ADD COLUMN     "home_score" INTEGER;

-- CreateIndex
CREATE INDEX "matches_result_status_result_entered_at_idx" ON "matches"("result_status", "result_entered_at");

-- CreateIndex
CREATE INDEX "media_assets_uploaded_by_id_created_at_idx" ON "media_assets"("uploaded_by_id", "created_at");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_sheet_media_id_fkey" FOREIGN KEY ("sheet_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── قيود CHECK (لا يمثّلها Prisma) ─────────────
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_decision_chk"
  CHECK ("decision" IS NULL OR "decision" IN ('reject','correct','replay'));
ALTER TABLE "dispute_votes" ADD CONSTRAINT "dispute_votes_decision_chk"
  CHECK ("decision" IN ('reject','correct','replay')
     AND ("uphold" = ("decision" <> 'reject'))
     AND (("decision" = 'correct') = ("home_score" IS NOT NULL AND "away_score" IS NOT NULL))
     AND ("home_score" IS NULL OR ("home_score" BETWEEN 0 AND 99 AND "away_score" BETWEEN 0 AND 99))
     AND (("home_pens" IS NULL) = ("away_pens" IS NULL)));
