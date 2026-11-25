-- الجلسة 14: الراعي الدائم — لوحة إعلان ثابتة في الرئيسية وصفحة البطولة، صورتها تُغيَّر من اللوحة

-- CreateTable
CREATE TABLE "sponsor_banners" (
    "id" SERIAL NOT NULL,
    "sponsor_id" INTEGER,
    "label_ar" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sponsor_banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sponsor_banners_is_active_sort_order_idx" ON "sponsor_banners"("is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "sponsor_banners" ADD CONSTRAINT "sponsor_banners_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── قيود CHECK (لا يمثّلها Prisma) ─────────────
ALTER TABLE "sponsor_banners" ADD CONSTRAINT "sponsor_banners_label_chk" CHECK (char_length("label_ar") BETWEEN 2 AND 60);
ALTER TABLE "sponsor_banners" ADD CONSTRAINT "sponsor_banners_image_chk"
  CHECK ("image_url" ~ '^/api/v1/media/[0-9]+$' OR "image_url" ~ '^/sponsors/[a-z0-9-]+\.(webp|png|jpg)$');
ALTER TABLE "sponsor_banners" ADD CONSTRAINT "sponsor_banners_link_chk"
  CHECK ("link_url" IS NULL OR "link_url" LIKE 'https://%' OR ("link_url" LIKE '/%' AND "link_url" NOT LIKE '//%'));

-- ───────────── الراعي الدائم الأول: جمعية الميثاق الأعظم (الراعي الماسي) ─────────────
-- يُضاف مرة واحدة مع هذا الـ migration. إن كان الراعي مضافاً من اللوحة مسبقاً فيُستخدم نفسه.
INSERT INTO "sponsors" ("name_ar", "website")
SELECT 'جمعية الميثاق الأعظم', 'https://grandcovenantiq.online'
WHERE NOT EXISTS (SELECT 1 FROM "sponsors" WHERE "name_ar" LIKE '%الميثاق الأعظم%');

INSERT INTO "sponsor_banners" ("sponsor_id", "label_ar", "image_url", "link_url", "updated_at")
SELECT (SELECT "id" FROM "sponsors" WHERE "name_ar" LIKE '%الميثاق الأعظم%' ORDER BY "id" LIMIT 1),
       'الراعي الماسي — جمعية الميثاق الأعظم', '/sponsors/gca-diamond.webp', 'https://grandcovenantiq.online', CURRENT_TIMESTAMP;
