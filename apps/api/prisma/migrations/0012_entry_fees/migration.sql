-- الجلسة 19: تفعيل رسوم الاشتراك بالبطولات وإلغاؤها بقرار المدير العام

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "fees_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fees_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "fees_note" TEXT;

-- البطولات الحالية برسوم تبقى مفعّلة كما هي
UPDATE "tournaments" SET "fees_enabled" = true WHERE "entry_fee_iqd" > 0;

-- لا رسوم مفعّلة بمبلغ صفر، والملاحظة قصيرة
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_fees_check"
  CHECK ((NOT "fees_enabled" OR "entry_fee_iqd" > 0) AND ("fees_note" IS NULL OR char_length("fees_note") <= 300));
