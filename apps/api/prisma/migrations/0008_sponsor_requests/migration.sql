-- الجلسة 11: طلبات رعاية الأحداث — الراعي يطلب ظهور شريحته في السلايدر خلال بطولة أو مباراة

-- CreateTable
CREATE TABLE "sponsor_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "sponsor_id" INTEGER,
    "org_name" TEXT NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "match_id" INTEGER,
    "title_ar" TEXT NOT NULL,
    "subtitle_ar" TEXT,
    "image_media_id" INTEGER,
    "link_url" TEXT,
    "days" INTEGER NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "review_note" TEXT,
    "slide_id" INTEGER,
    "handled_by_id" INTEGER,
    "handled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sponsor_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_requests_slide_id_key" ON "sponsor_requests"("slide_id");

-- CreateIndex
CREATE INDEX "sponsor_requests_status_created_at_idx" ON "sponsor_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "sponsor_requests_user_id_created_at_idx" ON "sponsor_requests"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "sponsor_requests" ADD CONSTRAINT "sponsor_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_requests" ADD CONSTRAINT "sponsor_requests_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_requests" ADD CONSTRAINT "sponsor_requests_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_requests" ADD CONSTRAINT "sponsor_requests_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_requests" ADD CONSTRAINT "sponsor_requests_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_requests" ADD CONSTRAINT "sponsor_requests_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_requests" ADD CONSTRAINT "sponsor_requests_slide_id_fkey" FOREIGN KEY ("slide_id") REFERENCES "hero_slides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── قيود CHECK (لا يمثّلها Prisma) ─────────────
ALTER TABLE "sponsor_requests" ADD CONSTRAINT "sponsor_requests_status_chk"
  CHECK ("status" IN ('pending', 'accepted', 'rejected', 'cancelled'));
ALTER TABLE "sponsor_requests" ADD CONSTRAINT "sponsor_requests_days_chk" CHECK ("days" IN (7, 14, 30));
-- الطلب المقبول مربوط براعٍ (الشريحة قد تُحذف لاحقاً فيصير slide_id فارغاً)
ALTER TABLE "sponsor_requests" ADD CONSTRAINT "sponsor_requests_accepted_chk"
  CHECK ("status" <> 'accepted' OR "sponsor_id" IS NOT NULL);
