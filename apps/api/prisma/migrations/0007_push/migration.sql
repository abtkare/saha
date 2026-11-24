-- الجلسة 7: إشعارات الهاتف عبر Expo Push — رموز الأجهزة ووقت إرسال كل إشعار

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "reminder_sent_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "pushed_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_pushed_at_created_at_idx" ON "notifications"("pushed_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── قيود CHECK (لا يمثّلها Prisma) ─────────────
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_platform_chk" CHECK ("platform" IN ('ios','android'));
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_token_chk"
  CHECK ("token" ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,200}\]$');

-- الإشعارات القديمة لا تُرسل للهاتف عند أول تشغيل بعد التحديث
UPDATE "notifications" SET "pushed_at" = "created_at" WHERE "pushed_at" IS NULL;
