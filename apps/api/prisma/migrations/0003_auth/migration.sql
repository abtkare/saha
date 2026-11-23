-- الجلسة 2: الدخول والأدوار
-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "mfa" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "totp_last_step" INTEGER;

