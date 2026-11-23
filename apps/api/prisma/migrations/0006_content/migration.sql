-- الجلسة 5: المحتوى والرعاة — نطاق الراعي في الأدوار، النتيجة النصية للمباراة، مراجعة الشرائح والأخبار،
-- الصور العامة، طلبات «كن راعياً»، وسحب الاعتماد تلقائياً عند تعديل شريحة معتمدة.

-- AlterTable
ALTER TABLE "user_roles" ADD COLUMN     "sponsor_id" INTEGER;

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "live_text_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "hero_slides" ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "sponsor_leads" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "org_name" TEXT,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "ip" TEXT,
    "handled_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sponsor_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sponsor_leads_status_created_at_idx" ON "sponsor_leads"("status", "created_at");

-- CreateIndex
CREATE INDEX "user_roles_sponsor_id_idx" ON "user_roles"("sponsor_id");

-- CreateIndex
CREATE INDEX "hero_slides_sponsor_id_idx" ON "hero_slides"("sponsor_id");

-- DropForeignKey — شريحة «مباراة اليوم» تُحذف مع مباراتها (إعادة القرعة تحذف المباريات، والقيد hero_slides_match_chk يمنع تفريغ match_id)
ALTER TABLE "hero_slides" DROP CONSTRAINT "hero_slides_match_id_fkey";

-- AddForeignKey
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_leads" ADD CONSTRAINT "sponsor_leads_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── قيود CHECK (لا يمثّلها Prisma) ─────────────

-- دور «راعٍ» بلا راعٍ محدد كان سيرى تقارير كل الرعاة؛ لا معنى له فيُحذف قبل فرض القيد.
DELETE FROM "user_roles" WHERE "role" = 'sponsor_viewer' AND "sponsor_id" IS NULL;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_sponsor_scope_chk"
  CHECK (("role" = 'sponsor_viewer') = ("sponsor_id" IS NOT NULL));

UPDATE "matches" SET "live_text" = NULL WHERE "live_text" IS NOT NULL AND char_length("live_text") NOT BETWEEN 1 AND 80;
ALTER TABLE "matches" ADD CONSTRAINT "matches_live_text_chk"
  CHECK ("live_text" IS NULL OR char_length("live_text") BETWEEN 1 AND 80);

ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_window_chk"
  CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");
-- لا تُنشر شريحة دون معرفة من اعتمدها (يكمّل hero_slides_publish_chk على approved_at).
-- المستخدمون لا يُحذفون فعلياً (حذف الحساب يغيّر حالته فقط)، فلا يصير approved_by_id فارغاً بعد النشر.
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_approver_chk"
  CHECK ("status" <> 'published' OR "approved_by_id" IS NOT NULL);

ALTER TABLE "posts" ADD CONSTRAINT "posts_publish_chk"
  CHECK ("status" NOT IN ('published', 'archived') OR "published_at" IS NOT NULL);
ALTER TABLE "posts" ADD CONSTRAINT "posts_slug_chk"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") BETWEEN 3 AND 80);

ALTER TABLE "sponsor_leads" ADD CONSTRAINT "sponsor_leads_status_chk"
  CHECK ("status" IN ('new', 'contacted', 'closed'));

-- ───────────── سحب الاعتماد عند تعديل الشريحة ─────────────
-- أي تغيير في محتوى شريحة معتمدة (النص، الصورة، الرابط، الراعي، المباراة، الفترة، النوع) يسحب اعتمادها،
-- والمنشورة ترجع «قيد المراجعة» فتختفي من السلايدر حتى تُعتمد من جديد. الأولوية لا تُعد محتوى.
-- هذا في القاعدة نفسها، فلا يمكن نشر محتوى مدفوع لم يعتمده أحد حتى لو أخطأ الكود.
CREATE FUNCTION hero_slides_revoke_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."approved_at" IS NOT NULL
     AND NEW."approved_at" IS NOT DISTINCT FROM OLD."approved_at"
     AND (NEW."type", NEW."title_ar", NEW."subtitle_ar", NEW."image_url", NEW."link_url", NEW."sponsor_id",
          NEW."tournament_id", NEW."match_id", NEW."starts_at", NEW."ends_at")
         IS DISTINCT FROM
         (OLD."type", OLD."title_ar", OLD."subtitle_ar", OLD."image_url", OLD."link_url", OLD."sponsor_id",
          OLD."tournament_id", OLD."match_id", OLD."starts_at", OLD."ends_at")
  THEN
    NEW."approved_at" := NULL;
    NEW."approved_by_id" := NULL;
    IF NEW."status" = 'published' THEN NEW."status" := 'review'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hero_slides_revoke_approval
  BEFORE UPDATE ON "hero_slides"
  FOR EACH ROW EXECUTE FUNCTION hero_slides_revoke_approval();
