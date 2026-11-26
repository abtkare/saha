-- الجلسة 16: الجوائز — المراكز الثلاثة الأولى وأفضل ثلاثة لاعبين، التسليم وتأكيد المستفيد، والأرشيف

-- CreateEnum
CREATE TYPE "prize_category" AS ENUM ('team_place', 'best_player');

-- CreateEnum
CREATE TYPE "prize_status" AS ENUM ('pending', 'awarded', 'delivered', 'confirmed');

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "prizes_announced_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "prizes" (
    "id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "category" "prize_category" NOT NULL,
    "rank" INTEGER NOT NULL,
    "title_ar" TEXT,
    "amount_iqd" INTEGER NOT NULL DEFAULT 0,
    "extra_ar" TEXT,
    "team_id" INTEGER,
    "player_id" INTEGER,
    "status" "prize_status" NOT NULL DEFAULT 'pending',
    "awarded_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "delivered_by_id" INTEGER,
    "delivery_note" TEXT,
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by_id" INTEGER,
    "updated_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "prizes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prizes_status_idx" ON "prizes"("status");

-- CreateIndex
CREATE INDEX "prizes_team_id_idx" ON "prizes"("team_id");

-- CreateIndex
CREATE INDEX "prizes_player_id_idx" ON "prizes"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "prizes_tournament_id_category_rank_key" ON "prizes"("tournament_id", "category", "rank");

-- AddForeignKey
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── قيود CHECK (لا يمثّلها Prisma) ─────────────
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_rank_chk" CHECK ("rank" BETWEEN 1 AND 3);
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_amount_chk" CHECK ("amount_iqd" BETWEEN 0 AND 2000000000);
-- لكل جائزة قيمة: مبلغ أو جائزة عينية
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_value_chk" CHECK ("amount_iqd" > 0 OR "extra_ar" IS NOT NULL);
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_title_chk" CHECK ("title_ar" IS NULL OR char_length("title_ar") BETWEEN 2 AND 40);
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_extra_chk" CHECK ("extra_ar" IS NULL OR char_length("extra_ar") BETWEEN 2 AND 120);
-- جائزة المركز للفريق فقط، وجائزة اللاعب لها لاعب متى حُدد فائزها
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_player_kind_chk" CHECK ("category" = 'best_player' OR "player_id" IS NULL);
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_winner_chk" CHECK (
  ("status" = 'pending' AND "team_id" IS NULL AND "player_id" IS NULL)
  OR ("status" <> 'pending' AND "team_id" IS NOT NULL AND ("category" = 'team_place' OR "player_id" IS NOT NULL))
);
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_delivery_chk" CHECK (
  ("status" IN ('pending', 'awarded') AND "delivered_at" IS NULL AND "confirmed_at" IS NULL)
  OR ("status" = 'delivered' AND "delivered_at" IS NOT NULL AND "confirmed_at" IS NULL)
  OR ("status" = 'confirmed' AND "delivered_at" IS NOT NULL AND "confirmed_at" IS NOT NULL AND "confirmed_by_id" IS NOT NULL)
);

-- ───────────── تجميد الجائزة بعد التسليم ─────────────
-- المؤكَّدة لا تُعدَّل أبداً (الأرشيف). المسلَّمة لا تتغير قيمتها ولا فائزها؛ تُرجَع «لم تُسلَّم» أو تُؤكَّد فقط.
CREATE FUNCTION prizes_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'confirmed' THEN
    RAISE EXCEPTION 'prize % confirmed: frozen', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'delivered' AND (
       NEW.amount_iqd IS DISTINCT FROM OLD.amount_iqd OR NEW.extra_ar IS DISTINCT FROM OLD.extra_ar
    OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.player_id IS DISTINCT FROM OLD.player_id
    OR NEW.category IS DISTINCT FROM OLD.category OR NEW.rank IS DISTINCT FROM OLD.rank
    OR NEW.tournament_id IS DISTINCT FROM OLD.tournament_id) THEN
    RAISE EXCEPTION 'prize % delivered: value and winner locked', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER prizes_lock BEFORE UPDATE ON "prizes" FOR EACH ROW EXECUTE FUNCTION prizes_lock();
