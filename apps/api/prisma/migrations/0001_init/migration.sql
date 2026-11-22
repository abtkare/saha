-- مخطط «ساحة» — المرحلة الأولى. مُولَّد مطابقاً لـ schema.prisma، وقيود CHECK في آخره.

CREATE TYPE "user_status" AS ENUM ('active', 'pending_guardian', 'suspended', 'deleted');

CREATE TYPE "role_name" AS ENUM ('super_admin', 'content_editor', 'sponsor_manager', 'tournament_manager', 'referee', 'team_manager', 'discipline_committee', 'sponsor_viewer');

CREATE TYPE "tournament_kind" AS ENUM ('popular_teams', 'influencer_followers', 'facebook_group');

CREATE TYPE "community_kind" AS ENUM ('influencer', 'facebook_group');

CREATE TYPE "tournament_format" AS ENUM ('league', 'knockout', 'groups_knockout');

CREATE TYPE "tournament_status" AS ENUM ('draft', 'registration', 'running', 'finished', 'cancelled');

CREATE TYPE "age_category" AS ENUM ('open', 'u18', 'u14');

CREATE TYPE "verify_method" AS ENUM ('oauth', 'manual');

CREATE TYPE "request_status" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

CREATE TYPE "result_status" AS ENUM ('scheduled', 'provisional', 'confirmed', 'disputed', 'final');

CREATE TYPE "match_event_type" AS ENUM ('goal', 'own_goal', 'yellow_card', 'red_card', 'mvp');

CREATE TYPE "dispute_status" AS ENUM ('open', 'upheld', 'rejected');

CREATE TYPE "content_status" AS ENUM ('draft', 'review', 'published', 'archived');

CREATE TYPE "slide_type" AS ENUM ('sponsor', 'news', 'match', 'tournament', 'promo');

CREATE TYPE "slide_event_type" AS ENUM ('impression', 'click');

CREATE TYPE "post_type" AS ENUM ('news', 'page');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "full_name" TEXT NOT NULL,
    "birth_year" INTEGER,
    "password_hash" TEXT,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "guardian_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "role_name" NOT NULL,
    "tournament_id" INTEGER,
    "team_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communities" (
    "id" SERIAL NOT NULL,
    "kind" "community_kind" NOT NULL,
    "name_ar" TEXT NOT NULL,
    "platform_url" TEXT,
    "external_id" TEXT,
    "owner_user_id" INTEGER,
    "followers_count" INTEGER,
    "verified_at" TIMESTAMPTZ(3),
    "verify_method" "verify_method",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" SERIAL NOT NULL,
    "name_ar" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "tournament_kind" NOT NULL DEFAULT 'popular_teams',
    "community_id" INTEGER,
    "community_kind" "community_kind",
    "city" TEXT,
    "starts_on" DATE,
    "ends_on" DATE,
    "format" "tournament_format" NOT NULL,
    "age_category" "age_category" NOT NULL DEFAULT 'open',
    "dispute_window_hrs" INTEGER NOT NULL DEFAULT 24,
    "entry_fee_iqd" INTEGER NOT NULL DEFAULT 0,
    "max_teams" INTEGER,
    "status" "tournament_status" NOT NULL DEFAULT 'draft',
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" SERIAL NOT NULL,
    "name_ar" TEXT NOT NULL,
    "logo_url" TEXT,
    "city" TEXT,
    "manager_id" INTEGER NOT NULL,
    "community_id" INTEGER,
    "fb_page_url" TEXT,
    "fb_page_id" TEXT,
    "verified_at" TIMESTAMPTZ(3),
    "verify_method" "verify_method",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_verification_requests" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER NOT NULL,
    "method" "verify_method" NOT NULL,
    "code" TEXT NOT NULL,
    "post_url" TEXT,
    "status" "request_status" NOT NULL DEFAULT 'pending',
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "guardian_id" INTEGER,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "birth_year" INTEGER NOT NULL,
    "media_consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_players" (
    "team_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "shirt_no" INTEGER,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_players_pkey" PRIMARY KEY ("team_id","player_id")
);

-- CreateTable
CREATE TABLE "tournament_registrations" (
    "id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "status" "request_status" NOT NULL DEFAULT 'pending',
    "group_label" TEXT,
    "fee_paid_iqd" INTEGER,
    "fee_recorded_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "stage" TEXT,
    "round" INTEGER,
    "home_team_id" INTEGER NOT NULL,
    "away_team_id" INTEGER NOT NULL,
    "kickoff_at" TIMESTAMPTZ(3),
    "venue" TEXT,
    "referee_id" INTEGER,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "result_status" "result_status" NOT NULL DEFAULT 'scheduled',
    "live_text" TEXT,
    "sheet_photo_url" TEXT,
    "home_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "away_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "result_entered_at" TIMESTAMPTZ(3),
    "finalized_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "player_id" INTEGER,
    "type" "match_event_type" NOT NULL,
    "minute" INTEGER,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "raised_by_id" INTEGER NOT NULL,
    "team_id" INTEGER,
    "reason" TEXT NOT NULL,
    "status" "dispute_status" NOT NULL DEFAULT 'open',
    "decision_note" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_votes" (
    "dispute_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "uphold" BOOLEAN NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_votes_pkey" PRIMARY KEY ("dispute_id","member_id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" SERIAL NOT NULL,
    "name_ar" TEXT NOT NULL,
    "logo_url" TEXT,
    "website" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_slides" (
    "id" SERIAL NOT NULL,
    "type" "slide_type" NOT NULL,
    "title_ar" TEXT NOT NULL,
    "subtitle_ar" TEXT,
    "image_url" TEXT,
    "link_url" TEXT,
    "sponsor_id" INTEGER,
    "tournament_id" INTEGER,
    "match_id" INTEGER,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "approved_by_id" INTEGER,
    "approved_at" TIMESTAMPTZ(3),
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hero_slides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slide_events" (
    "id" BIGSERIAL NOT NULL,
    "slide_id" INTEGER NOT NULL,
    "type" "slide_event_type" NOT NULL,
    "device_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slide_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "type" "post_type" NOT NULL DEFAULT 'news',
    "slug" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "body_ar" TEXT NOT NULL,
    "cover_url" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(3),
    "author_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" SERIAL NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "uploaded_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "title_ar" TEXT NOT NULL,
    "body_ar" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "seq" BIGINT NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "prev_hash" TEXT,
    "hash" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_guardian_id_idx" ON "users"("guardian_id");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "communities_id_kind_key" ON "communities"("id", "kind");

-- CreateIndex
CREATE INDEX "communities_owner_user_id_idx" ON "communities"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_slug_key" ON "tournaments"("slug");

-- CreateIndex
CREATE INDEX "tournaments_kind_status_idx" ON "tournaments"("kind", "status");

-- CreateIndex
CREATE INDEX "tournaments_community_id_community_kind_idx" ON "tournaments"("community_id", "community_kind");

-- CreateIndex
CREATE INDEX "teams_manager_id_idx" ON "teams"("manager_id");

-- CreateIndex
CREATE INDEX "teams_community_id_idx" ON "teams"("community_id");

-- CreateIndex
CREATE INDEX "team_verification_requests_team_id_idx" ON "team_verification_requests"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "players_user_id_key" ON "players"("user_id");

-- CreateIndex
CREATE INDEX "players_guardian_id_idx" ON "players"("guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_registrations_tournament_id_team_id_key" ON "tournament_registrations"("tournament_id", "team_id");

-- CreateIndex
CREATE INDEX "matches_tournament_id_idx" ON "matches"("tournament_id");

-- CreateIndex
CREATE INDEX "matches_kickoff_at_idx" ON "matches"("kickoff_at");

-- CreateIndex
CREATE INDEX "matches_referee_id_idx" ON "matches"("referee_id");

-- CreateIndex
CREATE INDEX "match_events_match_id_idx" ON "match_events"("match_id");

-- CreateIndex
CREATE INDEX "match_events_player_id_idx" ON "match_events"("player_id");

-- CreateIndex
CREATE INDEX "disputes_match_id_idx" ON "disputes"("match_id");

-- CreateIndex
CREATE INDEX "hero_slides_status_priority_idx" ON "hero_slides"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "slide_events_slide_id_type_device_id_day_key" ON "slide_events"("slide_id", "type", "device_id", "day");

-- CreateIndex
CREATE INDEX "slide_events_slide_id_created_at_idx" ON "slide_events"("slide_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");

-- CreateIndex
CREATE INDEX "posts_type_status_published_at_idx" ON "posts"("type", "status", "published_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_seq_key" ON "audit_log"("seq");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_community_id_community_kind_fkey" FOREIGN KEY ("community_id", "community_kind") REFERENCES "communities"("id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_verification_requests" ADD CONSTRAINT "team_verification_requests_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_verification_requests" ADD CONSTRAINT "team_verification_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_registrations" ADD CONSTRAINT "tournament_registrations_fee_recorded_by_fkey" FOREIGN KEY ("fee_recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_votes" ADD CONSTRAINT "dispute_votes_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_votes" ADD CONSTRAINT "dispute_votes_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slide_events" ADD CONSTRAINT "slide_events_slide_id_fkey" FOREIGN KEY ("slide_id") REFERENCES "hero_slides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── قيود CHECK (لا يمثّلها Prisma) ─────────────

-- نوع البطولة: الفرق الشعبية بلا مجتمع، والمؤثر/المجموعة يرتبطان اختيارياً بمجتمع من النوع نفسه
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_community_pair_chk"
  CHECK (("community_id" IS NULL) = ("community_kind" IS NULL));
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_kind_community_chk"
  CHECK (
    ("kind" = 'popular_teams'        AND "community_id" IS NULL) OR
    ("kind" = 'influencer_followers' AND ("community_kind" IS NULL OR "community_kind" = 'influencer')) OR
    ("kind" = 'facebook_group'       AND ("community_kind" IS NULL OR "community_kind" = 'facebook_group'))
  );
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_dates_chk"
  CHECK ("ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on");
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_numbers_chk"
  CHECK ("dispute_window_hrs" BETWEEN 1 AND 168 AND "entry_fee_iqd" >= 0 AND ("max_teams" IS NULL OR "max_teams" >= 2));

ALTER TABLE "players" ADD CONSTRAINT "players_owner_chk"
  CHECK ("user_id" IS NOT NULL OR "guardian_id" IS NOT NULL);
ALTER TABLE "players" ADD CONSTRAINT "players_birth_year_chk"
  CHECK ("birth_year" BETWEEN 1940 AND 2030);
ALTER TABLE "users" ADD CONSTRAINT "users_not_own_guardian_chk"
  CHECK ("guardian_id" IS NULL OR "guardian_id" <> "id");

ALTER TABLE "matches" ADD CONSTRAINT "matches_teams_chk" CHECK ("home_team_id" <> "away_team_id");
ALTER TABLE "matches" ADD CONSTRAINT "matches_scores_chk"
  CHECK (("home_score" IS NULL OR "home_score" >= 0) AND ("away_score" IS NULL OR "away_score" >= 0));
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_minute_chk"
  CHECK ("minute" IS NULL OR "minute" BETWEEN 0 AND 150);
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_shirt_chk"
  CHECK ("shirt_no" IS NULL OR "shirt_no" BETWEEN 1 AND 99);

ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_sponsor_chk"
  CHECK ("type" <> 'sponsor' OR "sponsor_id" IS NOT NULL);
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_match_chk"
  CHECK ("type" <> 'match' OR "match_id" IS NOT NULL);
-- شريحة مدفوعة/أي شريحة لا تُنشر دون اعتماد
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_publish_chk"
  CHECK ("status" <> 'published' OR "approved_at" IS NOT NULL);
