-- الجلسة 3: البطولات والفرق — القرعة والمجموعات، رمز انضمام الفريق، ركلات الترجيح، ملاحظة قرار التوثيق

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "away_pens" INTEGER,
ADD COLUMN     "home_pens" INTEGER;

-- AlterTable
ALTER TABLE "team_verification_requests" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "join_code" TEXT;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "double_round" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "draw_seed" TEXT,
ADD COLUMN     "drawn_at" TIMESTAMPTZ(3),
ADD COLUMN     "group_count" INTEGER,
ADD COLUMN     "qualifiers_per_group" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "teams_join_code_key" ON "teams"("join_code");

-- ───────────── قيود CHECK (لا يمثّلها Prisma) ─────────────
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_groups_chk"
  CHECK (("group_count" IS NULL OR "group_count" BETWEEN 1 AND 8)
     AND ("qualifiers_per_group" IS NULL OR "qualifiers_per_group" BETWEEN 1 AND 2));
ALTER TABLE "matches" ADD CONSTRAINT "matches_pens_chk"
  CHECK (("home_pens" IS NULL) = ("away_pens" IS NULL)
     AND ("home_pens" IS NULL OR ("home_pens" >= 0 AND "away_pens" >= 0 AND "home_pens" <> "away_pens")));
ALTER TABLE "matches" ADD CONSTRAINT "matches_round_chk" CHECK ("round" IS NULL OR "round" >= 1);
ALTER TABLE "teams" ADD CONSTRAINT "teams_join_code_chk" CHECK ("join_code" IS NULL OR "join_code" ~ '^[A-Z2-9]{6}$');

-- الفرق الموجودة تحصل على رمز انضمام
UPDATE "teams" SET "join_code" = upper(substr(translate(md5(random()::text || id::text), '01lo', '2345'), 1, 6)) WHERE "join_code" IS NULL;
