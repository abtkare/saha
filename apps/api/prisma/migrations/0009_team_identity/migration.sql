-- الجلسة 12: شعار الفريق (logo_url موجود) + اسم صاحب الفريق/المؤثر/صاحب الصفحة وصورته الشخصية

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "owner_name" TEXT,
ADD COLUMN     "owner_photo_url" TEXT;
