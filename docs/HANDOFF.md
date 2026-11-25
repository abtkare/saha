# ملف تسليم الجلسة — مشروع «ساحة»

آخر تحديث: 2026-11-25 06:20 (الجلسة 10 — TestFlight ✅)

## المشروع باختصار
منصة «ساحة» (Saha) للبطولات الكروية: موقع + تطبيق + لوحة إدارة.
ثلاثة أنواع بطولات: الفرق الشعبية، متابعو المؤثرين وصنّاع المحتوى، أعضاء مجموعات فيسبوك.
الشعار النصي: «كل جمهور يستحق بطولته». الخطة الكاملة والقرارات التقنية في `docs/PLAN.md`.

## ما أُنجز
- **الهوية:** شعار مطوَّر (حرف «س» كقوس منطقة الجزاء + كرة ذهبية)، ملفات SVG في `apps/preview/public/assets/`.
- **التصاميم:** لوحة تصميم فيها الشعار، شاشة البداية المتحركة، رئيسية التطبيق، رئيسية الموقع:
  https://claude.ai/artifact/R1ngn6jzwYEuNhSJmvTbvG
- **شاشة البداية المتحركة:** رسم حرف «س» ← كرة قدم حقيقية تسقط وتدور وترتد مع ظل وموجة ذهبية ← ظهور «ساحة» بلمعة ← الشعار النصي وثلاث شارات (الفرق الشعبية · متابعو المؤثرين · مجموعات فيسبوك). الكود في `apps/preview/public/styles.css`.
- **نسخة معاينة ثابتة** في `apps/preview` (HTML/CSS/JS + Caddy داخلي)، بيانات تجريبية للعرض.
- **المستودع:** `abtkare/saha` (خاص)، وتطبيق Claude على GitHub له صلاحية الرفع عليه.
- **البناء التلقائي:** `.github/workflows/preview.yml` يبني الصورة `ghcr.io/abtkare/saha-preview:latest` عند كل رفع على `main` — نجح أول بناء.

## السيرفر (VPS هوستنجر KVM 1)
- IP: `72.61.18.234` — Docker 29.9.2، Compose v5.6.1، مساحة حرة 35GB، ذاكرة متاحة ~2GB، بلا Swap.
- **Nginx على النظام نفسه يملك 80 و443** (يخدم على الأرجح «خصوصي» و«مشاوي»).
- منافذ مستخدمة: 8010، 8085، 8088، 8095، 8096. حاويات موجودة: daman-platform، mokwa-*، alwah-esign-*، loan-ocr-app-1، scalper-bot.
- **قرار النشر:** «ساحة» على `127.0.0.1:8097` خلف Nginx الموجود، بملف موقع مستقل `infra/nginx/saha.conf`، وشهادة certbot لهذا النطاق وحده. ملف التشغيل: `infra/docker-compose.yml` (المجلد على السيرفر: `/docker/saha`).
- **الرابط المؤقت الحالي:** http://72.61.18.234:8097 (المخطط لاحقاً مع HTTPS: https://saha.72-61-18-234.sslip.io)

## حالة النشر
- ✅ (2026-11-23) «ساحة» الكاملة تعمل في `/docker/saha-stack`: saha-db وsaha-redis وsaha-api (healthy) وsaha-web على `0.0.0.0:8098`، و`/api/v1/health` يعيد `{"status":"ok","db":"ok"}`. الحزمتان `saha-api` و`saha-web` عامتان.

### سجل سابق (2026-11-22)
- ✅ الحزمة `saha-preview` أصبحت عامة.
- ✅ حاوية `saha-preview` تعمل في `/docker/saha` وتعيد 200 محلياً. «خصوصي» و«مشاوي» لم تُلمسا.
- ❌ وكيل هوستنجر **لا يملك صلاحية** تثبيت الحزم (apt-get) ولا الكتابة في `/etc/nginx` ولا تشغيل Certbot. يملك Docker والفحص والتحكم بالخدمات فقط.
- **القرار المؤقت:** كشف المنفذ 8097 مباشرة، والرابط المؤقت `http://72.61.18.234:8097` (بلا HTTPS). المعاينة لا تحتاج HTTPS.
- **HTTPS مؤجل لجلسة النشر (8):** يحتاجه تسجيل فيسبوك وتطبيق الآيفون. الحل وقتها إما جلسة SSH لمرة واحدة من شخص يثق به المالك، أو طريقة عبر Docker لا تحتاج صلاحية الوكيل. ملف `infra/nginx/saha.conf` جاهز لذلك.

- ✅ نُفّذ «نص كشف المنفذ»: الحاوية `0.0.0.0:8097->80/tcp`، و`curl -I http://72.61.18.234:8097` يعيد 200 من السيرفر.
- ملاحظة: UFW مفعّل وليس فيه قاعدة لـ 8097، والوكيل لا يملك صلاحية تعديله. Docker يتجاوز UFW عادةً فالرابط يُفترض أن يعمل من الخارج. **لم يؤكد المالك بعد أنه فتحه من Safari.**

## الجلسة 1 — الأساس ✅ (2026-11-23)
- **الهيكل:** `apps/api` (NestJS 11 + Prisma 6)، `apps/web` (Next.js 15)، `packages/shared` (ثوابت وأنواع وتسميات عربية)، `packages/ui` (tokens.css + ألوان للتطبيق + الشعار). `apps/preview` باقية كما هي حتى الجلسة 6.
- **القاعدة:** `apps/api/prisma/schema.prisma` + `migrations/0001_init` (21 جدولاً + قيود CHECK) + `0002_audit_log`.
- **نوع البطولة:** `tournaments.kind` (popular_teams / influencer_followers / facebook_group) + جدول `communities` (مؤثر أو مجموعة) + ربط اختياري بمفتاح مركّب `(community_id, community_kind)`؛ البطولة الشعبية لا ترتبط بمجتمع، وبطولة المجموعة لا ترتبط بحساب مؤثر (مفروض في القاعدة نفسها).
- **سجل التدقيق:** بصمة SHA-256 متسلسلة يحسبها Trigger، منع UPDATE/DELETE/TRUNCATE، و`SELECT * FROM audit_verify()` يكشف التعديل والحذف وإعادة حساب البصمة. الاختبارات في `apps/api/test/audit-log.test.ts`.
- **الـ API الحالي:** `GET /api/v1/health` · `GET /api/v1/tournaments?kind=` · `GET /api/v1/tournaments/:id|slug`. الأخطاء برسالة عربية ورمز ثابت.
- **الموقع:** رئيسية بفلتر الأنواع الثلاثة + صفحة البطولة (المباريات بحالاتها والفرق)، و`/api/*` يُمرَّر للخادم → منفذ واحد.
- **البيانات التجريبية:** مدير عام من `.env` + 3 بطولات (نوع لكل واحدة) و6 فرق و9 مباريات بكل حالات النتيجة. تُزرع عند أول إقلاع فقط إن كان `SEED_DEMO=true`.
- **CI** (`.github/workflows/ci.yml`): تثبيت ← بناء ← تحقق تطابق migrations مع schema ← اختبارات ← زرع مرتين ← فحص الـ API ← `docker compose up --build` وفحص الموقع ← رفع `ghcr.io/abtkare/saha-api` و`saha-web` (`:latest` و`:sha`). أول تشغيل نجح كاملاً، وملف `pnpm-lock.yaml` يُحفظ تلقائياً.
- **ملاحظة للجلسات القادمة:** بيئة الجلسة لا تملك إنترنت لتثبيت الحزم؛ الكود يُختبر عبر CI على GitHub (`gh api .../actions/runs`). PostgreSQL محلي متاح لتجربة SQL.

## البند 0 — الالتزام بالتصميم الأصلي ✅ (2026-11-23)
- `apps/web/app/saha.css` **نسخة طبق الأصل** من `apps/preview/public/styles.css`، وفي آخرها قسم «إضافات» صغير فقط لحالات لا توجد في المعاينة الثابتة (بطاقة فارغة، زر «تفاصيل المباراة» من لوحة التصاميم، عرض الجدول على الجوال). **لا تعدّل التصميم إلا بتعديل المعاينة أولاً.**
- المكونات بنفس الـ markup والأسماء: `components/splash.tsx` (شاشة البداية بنفس السكربت والحركة)، `mark.tsx`، `cards.tsx` (بطاقة المباراة، بطاقة الهيرو، بطاقة البطولة، الجدول، الخبر)، `match-tabs.tsx` (أمس/اليوم/غداً)، `app-band.tsx`.
- الرئيسية مربوطة بالـ API: مباريات 3 أيام بتوقيت بغداد، «مباراة اليوم» في الهيرو، البطولات الجارية (الجارية أولاً) بشريط تقدّم، الترتيب لأول بطولة جارية، آخر 3 أخبار.
- صفحة البطولة مبنية من نفس المكونات (هيرو أخضر، مباريات بالجولة واليوم، جدول كامل، الفرق).
- أُلغي التحويل التلقائي للوضع الداكن من `packages/ui/tokens.css` (كان يقلب الألوان على آيفون بالوضع الداكن). الداكن يُصمَّم في الجلسة 6.
- **المقارنة البصرية:** CI يلتقط صور المعاينة والموقع (حاسوب 1440 وجوال 390 + إطاران لشاشة البداية + صفحة البطولة) ويحفظها في الفرع `ci-shots`. قورنت: التطابق تام في الرأس والهيرو والشارات والبطاقات والجدول والأشرطة والتذييل وشاشة البداية؛ الفرق الوحيد هو البيانات الحقيقية بدل التجريبية.
- واجهات جديدة عامة: `GET /matches?date=YYYY-MM-DD` · `GET /matches/:id` · `GET /tournaments/:id/standings` (المعتمدة والنهائية فقط) · `GET /news?limit=`.

## الجلسة 2 — الدخول والأدوار ✅ (2026-11-23)
- **OTP:** `POST /auth/otp/request {phone}` ← `POST /auth/otp/verify {phone, code, fullName?, birthYear?, guardianPhone?}`. المستخدم الجديد يحصل على `profile_required` دون استهلاك الرمز، ثم يرسل الاسم وسنة الميلاد مع الرمز نفسه. الرمز هاش في Redis، 5 دقائق، 5 محاولات. مزوّد `dev` = 000000، و`sms` يرد «غير مفعّل» حتى يُربط مزوّد.
- **Rate Limit (Redis):** 3 طلبات رمز/10 دقائق للرقم، 10 يومياً، 20/ساعة للـ IP؛ تحقق 30/15 دقيقة للـ IP؛ دخول الإدارة 5/15 دقيقة للبريد. ملاحظة: الطلبات تصل عبر الموقع فالـ IP الحقيقي غير مضمون حتى الـ proxy النهائي (الجلسة 8)؛ الحد بالرقم والبريد هو الأساس.
- **الجلسات:** رمز وصول JWT (HS256، 15 دقيقة) + رمز تجديد عشوائي يُخزَّن هاشه فقط في `sessions` (30 يوماً). `POST /auth/refresh` يدوّر الرمز، وإعادة استخدام رمز قديم تُلغي كل جلسات المستخدم. `POST /auth/logout`.
- **ولي الأمر:** دون 18 سنة يُشترط رقم ولي الأمر؛ الحساب `pending_guardian` بلا أي صلاحية. ولي الأمر يدخل برقمه (يُنشأ له حساب ناقص)، يكمل اسمه وسنة ميلاده (`PATCH /me`)، ثم `POST /me/wards/:id/approve`. أبناء بلا حساب: `POST /me/guardian/children` و`GET /me/children` و`PATCH /me/children/:id/consent`. سنة الميلاد لا تُعدَّل بعد كتابتها.
- **الإدارة:** `POST /auth/admin/login {email,password,totp?}`؛ أول مرة يرجع `totp_setup_required` + `setupToken` ← `POST /auth/admin/totp/setup` (السر ورابط otpauth لتطبيق Google Authenticator) ← `POST /auth/admin/totp/enable {code}`. سر TOTP مشفّر AES-256-GCM بمفتاح مشتق من `JWT_REFRESH_SECRET`، والرمز نفسه لا يُقبل مرتين. `POST /auth/admin/password` لتغيير كلمة السر الأولى.
- **الصلاحيات:** `packages/shared` → `PERMISSIONS` و`ROLE_PERMISSIONS` و`hasPermission(grants, perm, scope, mfa)` و`permissionsOf`. الأدوار المقيّدة ببطولة/فريق لا تتجاوز نطاقها. **أدوار المدير العام ومحرر المحتوى ومدير الرعاة لا تعمل إلا بدخول TOTP**. في الخادم: `@UseGuards(AuthGuard)` ثم `assertCan(req.auth, 'perm', {teamId|tournamentId})`.
- **الإدارة عبر API:** `GET /admin/audit/verify` · `GET /admin/audit` · `GET /admin/users?q=` · `POST /admin/users/:id/roles` · `DELETE /admin/users/:id/roles/:roleId` (لا يُسحب آخر مدير عام). نقاط بنطاق: `GET /teams/:id/players` · `GET /tournaments/:id/registrations`. الحساب: `GET/PATCH/DELETE /me`.
- **Swagger** على `/api/docs` للمدير العام بدخول TOTP فقط (ترويسة Authorization).
- **القاعدة:** `migrations/0003_auth` (`sessions.mfa`، `users.totp_last_step`).
- **الاختبارات:** `test/permissions.test.ts` (كل دور × كل صلاحية مقابل جدول مكتوب مستقلاً، النطاقات، TOTP بمتجه RFC 6238، JWT، scrypt) و`test/auth.e2e.test.ts` (يشغّل الخادم المبني على قاعدة حقيقية: OTP، Rate Limit، القفل، ولي الأمر، تدوير الجلسات، TOTP، الصلاحيات عبر HTTP، Swagger).
- الأسرار: في الإنتاج يرفض الخادم الإقلاع إن كان `JWT_SECRET` أو `JWT_REFRESH_SECRET` أقصر من 32 حرفاً (ملف `.env` على السيرفر فيه 64 حرفاً من نص التشغيل).

## الجلسة 3 — البطولات والفرق ✅ (2026-11-23)
- **الشرط تحقق:** `test/tournaments.e2e.test.ts` يُنشئ بطولة بـ 8 فرق عبر الـ API (9 فرق تتسجل، 8 تُعتمد والتاسع «اكتمل العدد»)، يجري القرعة ويعيد حسابها من البذرة، يجدولها (الجمعة والسبت 16:00 و18:00 بغداد)، يكتب النتائج ويقارن الترتيب بحساب مستقل (مع مباراة مؤقتة وأخرى متنازع عليها لا تدخلان). ويختبر أيضاً خروج المغلوب بـ 4 فرق وركلات الترجيح، والمجموعات (2×2) والتقاطع، وفئة تحت 18، وولي الأمر، والتوثيق اليدوي، والصلاحيات بالنطاق، وسلامة سجل التدقيق. نجح CI كاملاً.
- **منطق خالص مختبَر:** `src/tournaments/fixtures.ts` (الدوري، الذهاب والإياب، المجموعات، خروج المغلوب، الفائز، الجدولة، القرعة بالبذرة) + `test/fixtures.test.ts`.
- **الملفات:** `tournaments/manage.service.ts` و`manage.controller.ts` (الإدارة)، `teams/` (الفرق واللاعبون والتوثيق والأهلية)، `matches/match-manage.ts` (تعديل المباراة والأحداث)، `tournaments.service.ts` (الترتيب بالمجموعات، الهدافون، التحقق من القرعة). الثوابت الجديدة في `@saha/shared`: `MATCH_EVENT_TYPES` و`STAGE_LABELS` و`ageEligible`.
- **القاعدة:** `migrations/0004_tournaments` — `group_count`، `qualifiers_per_group`، `double_round`، `draw_seed`، `drawn_at`، `teams.join_code`، `home_pens`/`away_pens`، `team_verification_requests.note` + قيود CHECK. تُطبَّق تلقائياً عند إقلاع الحاوية (`prisma migrate deploy`).
- **الواجهات:** القائمة الكاملة في `docs/PLAN.md` ← «واجهات API»، والقرارات في «سجل التغييرات».
- **لقطات ci-shots (80d6912):** لقطة الموقع مطابقة للتصميم. لقطة المعاينة على الحاسوب التقطت شاشة البداية قبل اختفائها (توقيت الالتقاط في CI، لا تغيير في التصميم) — إن تكرر فزِد `virtual-time-budget` للمعاينة في `ci.yml`.
- **الموقع لم يتغير** في هذه الجلسة (صفحات الفريق والهدافين ولوحة الإدارة في الجلسة 6، وتبنى من مكونات `apps/preview`).
- **طريقة العمل:** فرع + Pull Request ← CI ← دمج في `main` (يبني الصور). المنطق الخالص يُجرَّب محلياً بـ `node --experimental-strip-types`، وPostgreSQL المحلي لتجربة الـ migrations.

## الجلسة 4 — النتائج والاعتراضات ✅ (2026-11-23)
- **الشرط تحقق:** `test/result-flow.test.ts` (جدول الانتقالات مقابل جدول مكتوب مستقلاً، النافذة، ركلات الترجيح، التأكيد المزدوج، أغلبية اللجنة) و`test/results.e2e.test.ts` (18 اختباراً عبر HTTP): كل انتقال مسموح يُنفَّذ، وكل ممنوع يُرفض برمز ثابت، والمؤقتة والمتنازع عليها لا تدخل الترتيب، والبطولة لا تنتهي قبل أن تصبح كل نتائجها نهائية. نجح CI كاملاً (92 اختباراً).
- **الدورة:** الحكم يرفع صورة الورقة (`POST /uploads`) ثم يدخل النتيجة (`POST /matches/:id/result`) ← مؤقتة ← مديرا الفريقين يؤكدان (`/confirm`) ← معتمدة ← تصبح نهائية تلقائياً عند انتهاء `dispute_window_hrs`. أو اعتراض (`/disputes`) ← متنازع عليها ← اللجنة تصوّت (`POST /admin/disputes/:id/vote`): رفض أو تصحيح ← نهائية، أو إعادة ← لم تبدأ. التفاصيل والقرارات في `docs/PLAN.md` ← «سجل التغييرات».
- **الملفات:** `src/matches/result-flow.ts` (منطق خالص)، `src/matches/results.ts` (الخدمة والواجهات)، `src/matches/result-sweeper.ts` (المهمة الخلفية كل 60 ثانية — بدل BullMQ)، `src/uploads/uploads.ts` (التخزين في `STORAGE_DIR`)، `src/notifications/notifications.ts`. الثوابت في `@saha/shared`: `RESULT_TRANSITIONS` و`DISPUTE_DECISIONS` و`DISPUTE_MAJORITY`.
- **القاعدة:** `migrations/0005_results` — `matches.sheet_media_id`، `disputes.decision`، أصوات اللجنة بالقرار والنتيجة المقترحة + قيود CHECK + فهرس للمهمة الخلفية.
- **البيانات التجريبية على السيرفر:** مباراتا «معتمدة» و«مؤقتة» في البطولة التجريبية أُدخلت نتيجتهما قبل 3 أيام، فستصبحان «نهائية» تلقائياً خلال دقيقة من التحديث — هذا هو السلوك الصحيح. الزرع الجديد (قاعدة فارغة) يبدأ مهلتهما من وقت الزرع.
- **الموقع لم يتغير** (لا صفحة جديدة في هذه الجلسة؛ صفحة المباراة ولوحة الحكم ولوحة اللجنة في الجلسة 6 من مكونات `apps/preview`). الواجهة العامة `GET /matches/:id` صار فيها `homeConfirmed` و`awayConfirmed` و`disputeDeadline` و`hasSheet` و`disputes` (بلا سبب الاعتراض).
- **ملاحظة:** دمج الـ Pull Request من الجلسة رُفض بأداة الحماية في هذه الجلسة؛ الدمج يتم بضغطة من المالك على GitHub (انظر الخطوات المعلّقة).

## الجلسة 5 — المحتوى والرعاة ✅ (2026-11-23)
- **الشرط تحقق:** `test/content.e2e.test.ts` (18 اختباراً عبر HTTP) و`test/content.test.ts` (6). الشريحة المدفوعة لا تظهر مسودةً ولا قيد المراجعة، ولا يعتمدها مدير الرعاة ولا من أنشأها أو عدّلها (حتى المدير العام)، وتعديل محتواها بعد النشر يسحب اعتمادها فتختفي — عبر الـ API وعبر تعديل مباشر في القاعدة (Trigger وقيدا CHECK). التقرير يُقارن يوماً بيوم بعدّ مستقل من جدول `slide_events`، وبما أرسله الاختبار فعلاً (12 ظهوراً و4 نقرات اليوم + أيام سابقة، ويوم خارج الفترة لا يدخل). نجح CI كاملاً (116 اختباراً).
- **الملفات:** `src/content/slides.ts` (السلايدر، الاعتماد، الأحداث، النتيجة النصية)، `src/content/sponsors.ts` (الرعاة، بوابة الراعي، «كن راعياً»)، `src/content/report.ts` (تجميع التقرير وCSV — منطق خالص)، `src/content/posts.ts` (الأخبار والصفحات؛ حلّ محل `src/news/`)، `src/content/common.ts`. صور المحتوى في `src/uploads/uploads.ts` (`MediaController`). الثوابت في `@saha/shared`: `SLIDE_TYPES` و`PAID_SLIDE_TYPES` و`CONTENT_STATUS_LABELS` و`HERO_REFRESH_SECONDS` و`ctr()`، و`RoleGrant.sponsorId`.
- **القاعدة:** `migrations/0006_content` — `user_roles.sponsor_id`، `matches.live_text_at`، `hero_slides.updated_by_id/review_note`، `posts.updated_by_id/review_note`، `media_assets.is_public`، جدول `sponsor_leads`، Trigger سحب الاعتماد، وقيود CHECK. شريحة «مباراة اليوم» تُحذف مع مباراتها.
- **الموقع لم يتغير شكله** (الصفحات واللوحة وبوابة الراعي في الجلسة 6 من مكونات `apps/preview`). الواجهات جاهزة: `/api/v1/home/hero` و`/api/v1/news/:slug` و`/api/v1/pages/:slug`.
- **القرارات** في `docs/PLAN.md` ← «سجل التغييرات»، والواجهات في «واجهات API».

## الجلسة 6 — الموقع واللوحة ✅ (2026-11-24)
- **الشرط تحقق:** كل الصفحات تعمل على الجوال والحاسوب باتجاه RTL وبالوضع الداكن — مثبت بلقطات CI (الفرع `ci-shots`، الملفات 5–21) وبفحص كل صفحة بـ curl في CI. نجح CI كاملاً. Pull Request رقم 6 من الفرع `session-6`.
- **الوضع الداكن:** صُمّم في `apps/preview` أولاً (CSS + زر 🌙 في الرأس) ثم نُسخ حرفياً إلى `saha.css`. الافتراضي فاتح والاختيار يُحفظ.
- **الموقع العام:** الرئيسية (الهيرو سلايدر مكان بطاقة «مباراة اليوم»)، `/tournaments`، `/tournaments/:slug` (+ الهدافون والمجموعات)، `/matches/:id`، `/teams/:id`، `/news`، `/news/:slug`، `/sponsor` («كن راعياً» بنموذج)، `/terms`، `/privacy`، `/contact`، `/app`. الأنماط الجديدة في `apps/web/app/saha-pages.css`.
- **اللوحة `/admin`:** الدخول ببريد الإدارة + TOTP (أول مرة يظهر زر يضيف الحساب لتطبيق Google Authenticator مباشرة) أو برقم الهاتف للحكام ومديري البطولات واللجنة. الأقسام: المؤشرات، البطولات، المباريات والنتائج، الاعتراضات، توثيق الفرق، الهيرو سلايدر، الأخبار والصفحات، الرعاة وطلبات الرعاية، المستخدمون والأدوار، سجل التدقيق، حسابي.
- **بوابة الراعي `/sponsor/portal`:** فترة، مؤشرات، رسمان يوميان، جدول، «تنزيل Excel»، و«تصدير PDF» بالطباعة (على الآيفون: مشاركة ← طباعة ← مشاركة ← حفظ في الملفات).
- **الملفات:** `apps/web/lib/client.ts` (عميل المتصفح والرموز)، `components/auth.tsx` (الدخول والجلسة)، `components/admin/*` (إطار اللوحة وأدواتها)، `components/hero-slider.tsx`، `components/day-chart.tsx`، `.github/scripts/shots.mjs` (لقطات CI بدخول مدير عام).
- **الـ API:** إضافة حقول فقط لـ `GET /admin/tournaments` و`GET /tournaments/:id/fixtures`. لا migration.
- **ملاحظة أمان:** بعد أول دخول للوحة غيّر كلمة السر الأولى من «حسابي» (12 حرفاً على الأقل).

## الجلسة 7 — التطبيق ✅ (2026-11-24)
- **التطبيق `apps/mobile`:** Expo SDK 58 (RN 0.88)، خارج مساحة pnpm (npm وحده)، ويقرأ `@saha/shared` و`@saha/ui` من مصدرهما. تنقّل مكتوب داخلياً `src/nav.tsx` (5 تبويبات كتصميم «رئيسية التطبيق»: الرئيسية، البطولات، فريقي، الأخبار، حسابي).
- **الشاشات:** شاشة البداية المتحركة (نفس توقيتات الموقع)، الرئيسية (الهيرو سلايدر يتحدث كل 30 ثانية ويقيس الظهور والنقر، أمس/اليوم/غداً، البطولات الجارية، الترتيب، الأخبار)، البطولات بفلتر الأنواع، البطولة (المباريات/الترتيب/الفرق/الهدافون + «سجّل فريقك»)، المباراة (أكّد/اعترض لمديري الفريقين، «أدخل النتيجة» للحكم)، إدخال النتيجة (الأهداف، الترجيح، تصوير الورقة بالكاميرا، الأحداث، النتيجة النصية)، الفريق، فريقي (نتائج تنتظر تأكيدي، مباريات أحكمها، فرقي)، إدارة الفريق (رمز الانضمام ومشاركته، اللاعبون، التوثيق، التسجيل في البطولات)، إنشاء فريق، الانضمام برمز، الأخبار والخبر، الإشعارات، حسابي (الاسم، الأدوار، الإشعارات، المظهر حسب الهاتف/فاتح/داكن، الخروج، حذف الحساب)، العائلة (موافقة ولي الأمر، الأبناء وموافقة الصور وضمّهم لفريق)، الدخول (هاتف ← رمز ← الاسم وسنة الميلاد ورقم ولي الأمر)، البحث، الشروط/الخصوصية/اتصل بنا.
- **Expo Go من رابط مباشر:** صورة الموقع `saha-web` تبني حزمة التطبيق وتقدّمها: `GET /expo` (manifest بصيغة خادم Expo الرسمي) و`/index.bundle` (الحزمة) و`/expo-app/fonts`. **مُثبت على محاكي آيفون بـ Expo Go 58.0.7:** التطبيق يفتح ويحمّل الخطوط والبيانات من الخادم، وكل الشاشات ملتقطة فاتحة وداكنة في الفرع `ci-shots-app`. الشروط الثلاثة التي اكتُشفت بالتجربة في `docs/PLAN.md` ← سجل التغييرات. الرابط: `exp://72.61.18.234:8098/expo`، وصفحة http://72.61.18.234:8098/app فيها زر «افتح ساحة في Expo Go». لا حاجة لحساب Expo ولا لخادم تطوير.
- **إشعارات الهاتف:** الخادم جاهز ومختبر (`test/push.e2e.test.ts` بخادم Expo وهمي): تسجيل الجهاز، الإرسال مرة واحدة، الشارة، تعطيل الجهاز المحذوف، تذكير «مباراتك بعد قليل»، إشعار قرار التسجيل والتوثيق. **يبقى للتفعيل على الهاتف معرّف مشروع Expo** (الخطوة المعلّقة 15). بدونه الإشعارات تظهر داخل التطبيق فقط.
- **القاعدة:** `migrations/0007_push` (`push_tokens`، `notifications.pushed_at`، `matches.reminder_sent_at`). يُطبَّق تلقائياً عند Update.
- **CI:** وظيفة `mobile` (الأنواع + الاختبارات + `expo export`)، فحص `/expo` في وظيفة التشغيل، و`.github/workflows/app-ios.yml` على macOS: المنصة كاملة + Expo Go على محاكي آيفون + لقطات كل الشاشات في الفرع `ci-shots-app` (يعمل عند تغيّر التطبيق في فروع `session-*`؛ دقائق macOS أغلى عشر مرات).
- **Pull Request رقم 7** من الفرع `session-7`.
- ملاحظة: الفرع `probe-sdk58` (تجربة لمعرفة إصدارات SDK 58) بقي على GitHub لأن الجلسة لا تملك صلاحية حذف الفروع؛ لا يؤثر على شيء ويمكن حذفه من صفحة Branches.


> **⚠️ نتيجة التجربة على آيفون حقيقي (2026-11-24):** Expo Go وصل إلى `/expo` لكنه رفض الفتح برسالة «You need to be signed in to Expo Go and Expo CLI to open your project». السبب: على هاتف حقيقي وعبر الإنترنت (لا الشبكة المحلية) يشترط Expo Go أن يكون المشروع تابعاً لحساب Expo ومُوقَّعاً، وأن يكون المستخدم مسجلاً في Expo Go بنفس الحساب (المحاكي في CI يفتحه لأن العنوان محلي). **الحل في الجلسة 8 (أول مهمة):** نشر التطبيق بـ **EAS Update** من CI إلى حساب المالك في Expo، وفتحه في Expo Go بعد تسجيل الدخول فيه بنفس الحساب. يحتاج من المالك: حساب expo.dev مجاني، ومشروع `saha` (Project ID واسم الحساب)، و**Access Token** يُضاف في GitHub ← Settings ← Secrets and variables ← Actions باسم `EXPO_TOKEN`. نفس الحساب يفعّل إشعارات الهاتف أيضاً.

## الجلسة 8 — النشر ⏳ (بدأت 2026-11-24؛ PR #9 وPR #10 مدموجان — انظر «حالة 2026-11-25 03:30» أدناه)
- ✅ **EAS Update من CI:** `.github/workflows/app-update.yml` ينشر التطبيق إلى مشروع Expo «saha» (الحساب `appshoplive`، Project ID `e971c618-1a3d-49f3-8c3d-ddf5bd31ce29`، السر `EXPO_TOKEN` في GitHub). فرع `main` ← القناة `production`، فروع `session-*` ← القناة `preview`. الإعداد في `apps/mobile/app.config.js` (يُفعَّل بـ `SAHA_EAS=1`): owner وprojectId و`runtimeVersion: {policy: "sdkVersion"}` ← `exposdk:58.0.0` (**شرط Expo Go**؛ أول محاولة خرجت `0.7.0` ورُفضت). عنوان الموقع للتطبيق المنشور: `SAHA_WEB_URL` (حالياً `http://72.61.18.234:8098` — يُغيَّر إلى https بعد نجاح HTTPS). الروابط تُكتب في ملخص كل تشغيل (`scripts/eas-links.mjs`).
- ✅ **(2026-11-25) المالك فتح التطبيق على آيفونه** في Expo Go (نسخة preview) بعد تسجيل الدخول بحساب appshoplive. ملاحظة: لصق رابط `exp://` في بحث Google لا يعمل؛ الطريقة: Expo Go ← Home ← Projects ← saha، أو https://expo.dev/accounts/appshoplive/projects/saha/updates ← Preview. صفحة `/app` في الموقع صار فيها زر لرابط القناة production (يعمل بعد الدمج).
- ✅ **زر «أرسل إشعاراً تجريبياً»** في التطبيق (حسابي ← الإشعارات، يظهر بعد تفعيل إشعارات الهاتف): `POST /me/notifications/test` يكتب إشعاراً للمستخدم نفسه فترسله مهمة Expo Push خلال ثوانٍ، ويعيد عدد أجهزته (0 = الجهاز غير مسجل)، وحدّه 3 كل 10 دقائق. مختبر في `test/push.e2e.test.ts`.
- ✅ **الإشعارات:** projectId صار موجوداً في التطبيق المنشور (`extra.eas.projectId`) فيأخذ رمز Expo Push. **يبقى التحقق على الهاتف** من وصول إشعار فعلي.
- ⏳ **HTTPS — حاوية `saha-edge`** (`apps/api/ops/edge.sh` داخل صورة saha-api، وخدمة `edge` في `infra/docker-compose.stack.yml`): privileged + `pid: host` وتنفّذ على السيرفر عبر `nsenter`. تضيف ملف موقع واحداً `/etc/nginx/conf.d/saha-sslip.conf` (أو sites-enabled) للنطاق `saha.72-61-18-234.sslip.io` ← `127.0.0.1:8098`، شهادة Let's Encrypt بحاوية certbot (webroot) في `/docker/saha-stack/letsencrypt`، وتجديد كل 12 ساعة. تفحص كل المواقع الأخرى (خصوصي/مشاوي) قبل وبعد، وتتراجع تلقائياً إن فشل `nginx -t` أو تغيّر رمز أي موقع، ولا تكتب فوق ملف ليس من صنعها. اختبار CI (nginx حقيقي على المشغّل + موقع «khousousi.test» على 80 و443 + تراجع + عدم الكتابة فوق ملف يدوي). ✅ (2026-11-25) **أُصلح:** رصد المواقع الأخرى كان يقرأ `server_name` في أول السطر فقط فلم يرصد الموقع المكتوب في سطر واحد — صار يرصده في أي مكان مع تجاهل التعليقات، والاختبار يشترط ظهور `khousousi.test http=200 https=200` في السجل.
- ⏳ **النسخ الاحتياطي — خدمة `backup`** (postgres:16-alpine): نسخة عند أول تشغيل ثم يومياً 03:00 بغداد في `/docker/saha-stack/backups/saha-*.sql.gz`، الاحتفاظ 14 يوماً، `pg_dump --clean --if-exists`. اختبار CI (نسخ ← استرجاع في قاعدة جديدة ← مقارنة الأعداد ← `audit_verify()` ← استرجاع ثانٍ فوقها). ✅ (2026-11-25) **أُصلح:** سبب التعليق كان في الاختبار لا في ملف السيرفر — `docker compose config` يُبقي الهروب `$$` في ناتجه (Compose يفكّه عند التشغيل فقط)، فصار `$$` رقم العملية، ولم يتحقق شرط `BACKUP_ONCE` فدخل السكربت حلقة اليوم الكامل. الاختبار يفكّ `$$` الآن كما يفعل Compose ويتحقق منه، ومهلة 120 ثانية. نجح: نسخ ← استرجاع ← تطابق الأعداد ← `audit_verify()` ← استرجاع ثانٍ فوقها.
- ✅ **TestFlight مجهّز:** `apps/mobile/eas.json` (profile `production`، `SAHA_STORE=1`)، أيقونة `apps/mobile/assets/icon.png`، نصوص الأذونات بالعربية، و`.github/workflows/app-store.yml` يدوي (بناء EAS ثم `eas submit`). **ينتظر من المالك:** حساب Apple Developer (99$ سنوياً)، تطبيق في App Store Connect بالمعرّف `app.saha.iq`، والأسرار: `ASC_KEY_P8`، `ASC_KEY_ID`، `ASC_ISSUER_ID`، `APPLE_TEAM_ID`، `ASC_APP_ID`. لم يُجرَّب بعد (غير مؤكد أن EAS ينشئ شهادات iOS دون تفاعل بمفتاح ASC). نسخة المتجر تستخدم https فيجب أن ينجح HTTPS أولاً.

## الجلسة 9 — saha-ops ✅ (2026-11-25)
- ✅ **(04:04) نجح على السيرفر:** المالك أنشأ `saha-ops` بزر Compose from URL (قبِل رابط http). saha-edge: شهادة Let's Encrypt (تنتهي 2027-02-23 وتتجدد تلقائياً)، و`https://saha.72-61-18-234.sslip.io/api/v1/health` ← 200، والمواقع الأخرى (khousousi.com، mashawi وadminmashawi، api، esign، ocr) بنفس رموزها قبل وبعد. saha-backup: أول نسخة `saha-2026-11-25_0404.sql.gz` (20K).
- ملاحظة: قبل إنشاء saha-ops كان رابط sslip يعرض صفحة دخول «مشاوي» لأنه الموقع الافتراضي في Nginx لأي نطاق غير معرَّف — ليس عطلاً.
- ✅ **(04:23) إشعار فعلي وصل إلى آيفون المالك** من زر «أرسل إشعاراً تجريبياً» (Expo Go، التطبيق على https). إشعارات الهاتف تعمل.
- ⏳ **TestFlight — حالة 05:22:**
  - ✅ حساب Apple Developer **شركة** (COMPANY_OR_ORGANIZATION): «شركة عصر الريادة للتجارة العامة والنقل العام وتأجير السيارات ذات المسؤولية المحدودة»، **Team ID `2PB3RY6HRM`** (في الحساب فريق آخر «شركة جلب الدرع» — لا نستخدمه). بريد الدخول للمطوّر: alriyadagroup01@gmail.com (ليس Apple ID الشخصي).
  - ✅ المعرّف `app.saha.iq` مسجّل (الوصف Saha؛ عليه بالخطأ قدرة «يتطلب إنشاء الحساب رقم هاتف» — لا تضر). Push Notifications لم تُفعَّل يدوياً — EAS يفعّلها عند البناء.
  - ✅ تطبيق App Store Connect أُنشئ: الاسم «ساحة البطولات»، iOS، العربية، SKU `saha`. رسالة «user access settings could not be saved» لا تهم. رسالة «Unable to Add for Review» تخص مراجعة المتجر لاحقاً لا TestFlight.
  - **باقٍ من المالك:** (1) رقم **Apple ID** للتطبيق من App Information. (2) مفتاح API: Users and Access ← Integrations ← App Store Connect API (Request Access إن ظهر) ← Team Keys ← + ← الاسم EAS، الصلاحية **Admin** ← Download ملف .p8 + نسخ **Issuer ID** و**Key ID**. (3) السر `ASC_KEY_P8` في GitHub (يغيّر امتداد الملف إلى .txt في «الملفات» ليفتحه وينسخ نصه) — الجلسة لا تملك صلاحية أسرار/متغيرات Actions.
  - **على الجلسة بعد استلام القيم:** في `.github/workflows/app-store.yml` اكتب القيم غير السرية مباشرة (Team ID `2PB3RY6HRM`، `EXPO_APPLE_TEAM_TYPE: COMPANY_OR_ORGANIZATION`، Key ID، Issuer ID، ASC App ID) واجعل السر الوحيد `ASC_KEY_P8` (+ EXPO_TOKEN الموجود)، ثم PR ← CI ← دمج ← تشغيل «نسخة TestFlight (iOS)» (workflow_dispatch — إن رُفض من الجلسة لأن مسارات Actions محجوبة بالبروكسي، فالمالك يضغط Run workflow من GitHub). غير مؤكد أن EAS ينشئ شهادات iOS دون تفاعل بمفتاح ASC — إن فشل فالبديل: تشغيل `eas credentials` تفاعلياً مرة واحدة (يحتاج حاسوباً) أو رفع شهادة/ملف تعريف يدوياً.
- ✅ **(05:45) القيم جاهزة:** Apple ID للتطبيق `6838996508`، مفتاح API «EAS» بصلاحية Admin — Key ID `4X6NC7B978`، Issuer ID `61482282-93b4-43db-9e12-2a752b3b4448`. السر `ASC_KEY_P8` أُضيف في GitHub (رسالة «تمت إضافة سر المستودع»). ملف .p8 في تنزيلات آيفون المالك ولا يُفتح على الآيفون — لا حاجة له بعد الآن.
- ✅ **(06:17) أول نسخة TestFlight رُفعت:** بناء EAS رقم **8** (buildNumber يُدار عن بُعد ويزيد تلقائياً) ← `eas submit` ← «Submitted your app to Apple App Store Connect». EAS أنشأ مجموعة اختبار داخلية «Team (Expo)». الفرع `testflight` (PR إلى main).
  - **كيف يعمل `app-store.yml`:** القيم غير السرية مكتوبة فيه، والسرّان `EXPO_TOKEN` و`ASC_KEY_P8` فقط. يبدأ بـ Run workflow أو **بالرفع على الفرع `testflight`** (الجلسة لا تستطيع workflow_dispatch). النتيجة من `/commits/<sha>/check-runs` وسجل الوظيفة.
  - **التوقيع:** EAS يرفض إنشاء شهادات iOS دون تفاعل («Distribution Certificate is not validated for non-interactive builds»). الحل `.github/scripts/asc-signing.mjs`: عبر App Store Connect API ينشئ في كل تشغيل شهادة Apple Distribution جديدة + ملف تعريف App Store باسم `saha-eas <الرقم التسلسلي>`، ويلغي فقط ما أنشأه التشغيل السابق بهذا الاسم (لا يلمس غيره؛ الإلغاء لا يؤثر على النسخ المرفوعة)، ويفعّل Push Notifications على المعرّف، ثم `credentialsSource: local`.
  - **أداة التثبيت على EAS:** بلا ملف قفل في `apps/mobile` يختار EAS yarn ويفشل بسبب `packageManager: pnpm` في الجذر. الحل: CI يحذف `package-lock.json` من `apps/mobile/.gitignore` ويضيفه مع `eas.json` المعدّل في commit محلي على المشغّل (أرشيف EAS يحترم .gitignore).
  - عند فشل البناء تطبع خطوة «سبب الفشل من سجل EAS» آخر 200 سطر من سجل EAS (`.github/scripts/eas-log.mjs`) — الجلسة لا تصل إلى expo.dev.
  - ✅ (07:20) **المختبرون عبر API:** `testflight-testers.yml` + `.github/scripts/asc-testers.mjs` (تشغيل: الرفع على الفرع `testflight-testers` بـ commit بلا `[skip ci]`، والقائمة في `TESTER_EMAILS`). أُضيف alriyadagroup01@gmail.com إلى «Team (Expo)» (داخلية، كل النسخ) وأُرسلت الدعوة. بناء 8 = VALID. مستخدمو الفريق: devkaccount@icloud.com وmoayadqazas@icloud.com (ADMIN)، rezan1rezan2@gmail.com (APP_MANAGER)، alriyadagroup01 (ACCOUNT_HOLDER). ملاحظة: Safari على آيفون المالك يُدخله تلقائياً بـ appshoplive@gmail.com (ليس في الفريق) — كلمة سر حساب الشركة لم تنجح من Safari؛ لهذا صارت الإضافة عبر API.
  - **باقٍ:** (1) المالك يفتح دعوة TestFlight في Gmail ‏alriyadagroup01 على الآيفون ويثبّت ويجرّب. (2) **إشعارات الهاتف في نسخة TestFlight لن تعمل** حتى يُرفع مفتاح APNs (.p8 من developer.apple.com ← Keys ← Apple Push Notifications service) إلى Expo (`eas credentials` أو صفحة Credentials في expo.dev) — في Expo Go تعمل كما هي. (3) مراجعة المتجر لاحقاً: لقطات، وصف، سياسة الخصوصية، تقييم العمر، ومتطلبات الصين يمكن تجاهلها باستبعاد الصين من التوزيع.
- ملاحظة: الجلسة **لا تستطيع** قراءة/تشغيل مسارات GitHub Actions عبر البروكسي (`/actions/...` محجوب: المتغيرات والأسرار وworkflow_dispatch)، لكنها تقرأ نتائج check-runs وسجلات jobs عبر `/commits/<sha>/check-runs` و`/actions/jobs/<id>/logs`.
- (قديم) المالك أكّد أن لديه حساب Apple Developer (2026-11-25). الخطة: سر واحد فقط في GitHub (`ASC_KEY_P8`)، والقيم غير السرية (Key ID، Issuer ID، Team ID، Apple ID للتطبيق، نوع الحساب) يرسلها المالك في المحادثة فتُكتب في `app-store.yml`.
- ✅ **التطبيق صار على https:** القيمة الافتراضية لـ `SAHA_WEB_URL` في `app-update.yml` وبديل `src/config.ts` = `https://saha.72-61-18-234.sslip.io` (الجلسة لا تملك صلاحية متغيرات GitHub Actions، فغُيّرت القيمة في الملف).
- **مشروع منفصل `saha-ops`** (`infra/docker-compose.ops.yml`): خدمتا `backup` و`edge` فقط، على الشبكة `saha_net`، أسرار القاعدة من `/docker/saha-stack/.env` (مسار مطلق، قراءة فقط)، النسخ في `/docker/saha-stack/backups`. لا يغيّر `saha-stack` إطلاقاً.
- **الرابط العام** لزر Compose from URL يقدّمه موقع ساحة: `http://72.61.18.234:8098/ops/saha-ops.yml` (الملف يُنسخ إلى صورة saha-web عند البناء). نسخة الطوارئ: `/ops/saha-ops-remove.yml`.
- أُزيلت `backup` و`edge` من `infra/docker-compose.stack.yml` (أربع خدمات) حتى لا تتكرر الأسماء.
- الخطوات للمالك في القسم «تشغيل saha-ops من Docker Manager» أدناه.

## تشغيل saha-ops من Docker Manager (بعد دمج PR الجلسة 9 وانتهاء البناء)
1. Docker Manager ← Projects ← **`saha-stack`** ← ⋮ ← **Update** (ليصل الرابط الجديد للموقع). تحقق من Safari: http://72.61.18.234:8098/ops/saha-ops.yml يعرض نصاً يبدأ بـ «# «ساحة» — مشروع saha-ops».
2. Docker Manager ← **Compose** ← **Compose from URL** ← الرابط: `http://72.61.18.234:8098/ops/saha-ops.yml` ← اسم المشروع: `saha-ops` ← **Deploy**.
3. بعد دقيقتين: مشروع `saha-ops` فيه حاويتان: **saha-backup** و**saha-edge**. مشروع `saha-stack` يبقى بأربع حاويات كما هو.
4. سجل `saha-edge` (Logs): «المواقع الأخرى قبل أي تغيير» ← «✅ الشهادة جاهزة» ← «🎉 ساحة على https://saha.72-61-18-234.sslip.io». إن ظهر ⛔ فلم يتغير شيء — انسخ السجل للجلسة.
5. سجل `saha-backup`: «✅ نسخة احتياطية: /backups/saha-….sql.gz».
6. Safari: https://saha.72-61-18-234.sslip.io/api/v1/health ← `ok`، **ثم افتح موقعي «خصوصي» و«مشاوي»**.
7. **طوارئ** (إن تأثر أي موقع آخر لاحقاً): احذف مشروع `saha-ops` من Docker Manager ← Compose from URL بالرابط `http://72.61.18.234:8098/ops/saha-ops-remove.yml` باسم `saha-ops` ← تحذف saha-edge ملف ساحة وحده من Nginx. للرجوع: احذفه وأنشئه من الرابط العادي.
- **إن رفض Docker Manager رابط http** (يشترط https): أخبر الجلسة — البديل نشر الملف نفسه على رابط https عام (مثلاً موقع Netlify صغير بحساب المالك).

## خطوات معلّقة (بالترتيب)
1. ✅ (2026-11-23) المالك فتح `http://72.61.18.234:8098/api/v1/health` من Safari على الآيفون ← `ok` (المنفذ 8098 مفتوح من الخارج). ✅ تحديث الجلسة 3 وصل عبر زر Update في Docker Manager: رابط `/api/v1/tournaments/baghdad-sahat-2026/scorers` يعيد `[]`.
2. ✅ (2026-11-23) صور الجلسة 3 تعمل على السيرفر، والـ migration `0004` طُبّق.
3. ✅ الجلسة 4 — النتائج والاعتراضات (الكود جاهز ومختبر في الفرع `session-4`، Pull Request رقم 2).
4. ✅ (2026-11-23) دُمجت الجلسة 4 (PR #2).
   ~~دمج الجلسة 4:~~ من تطبيق GitHub أو Safari: https://github.com/abtkare/saha/pull/2 ← زر **Merge pull request** ← **Confirm**. بعد الدمج يبني CI الصور الجديدة (نحو 6 دقائق).
5. ✅ (2026-11-23) وصلت الجلسة 4 للسيرفر: `/api/v1/me/notifications` يعيد «سجّل الدخول أولاً». سبب التأخير: كان Update يُضغط على مشروع المعاينة `preview` (8097) لا على `saha-stack`.
   ~~تحديث السيرفر:~~ Docker Manager ← `saha-stack` ← ⋮ ← **Update**. التحقق من Safari: `http://72.61.18.234:8098/api/v1/me/notifications` يجب أن يعطي «سجّل الدخول أولاً» (لا «غير موجود») — هذا يثبت وصول الجلسة 4، وأن الـ migration `0005` طُبّق.
6. ✅ الجلسة 5 — المحتوى والرعاة (الكود جاهز ومختبر في الفرع `session-5`، Pull Request رقم 4).
7. ✅ (2026-11-23) دُمجت الجلسة 5 (Pull Request رقم 4، commit `f1f2110`) وبُنيت الصور.
8. ✅ (2026-11-24) وصلت الجلسة 5 للسيرفر: `/api/v1/home/hero` يعيد `"refreshSeconds":30` مع شريحتين (مباراة اليوم: شباب الكرادة × صقور المنصور، وشريحة الراعي التجريبي)، فالـ migration `0006` طُبّق. ملاحظة: ظهر عطل مؤقت في Docker Manager نفسه («Temporary Docker Manager issue») ثم زال.
   ~~تحديث السيرفر:~~ Docker Manager ← `saha-stack` ← ⋮ ← **Update** (ليس مشروع `saha`). التحقق من Safari: `http://72.61.18.234:8098/api/v1/home/hero` يجب أن يعطي `"refreshSeconds":30` ومعه الشرائح التجريبية المنشورة — هذا يثبت وصول الجلسة 5 وتطبيق الـ migration `0006`.
9. ✅ الجلسة 6 — الموقع واللوحة (الكود جاهز ومختبر في الفرع `session-6`، Pull Request رقم 6).
10. ✅ (2026-11-24) دُمجت الجلسة 6 (PR #6).
    ~~دمج الجلسة 6:~~ من تطبيق GitHub أو Safari: https://github.com/abtkare/saha/pull/6 ← **Merge pull request** ← **Confirm**. بعد الدمج يبني CI الصور (نحو 8 دقائق).
11. ✅ (2026-11-24) وصلت الجلسة 6 للسيرفر واللوحة تعمل.
    ~~تحديث السيرفر:~~ Docker Manager ← `saha-stack` ← ⋮ ← **Update** (ليس مشروع `saha`). التحقق من Safari: `http://72.61.18.234:8098/tournaments` تفتح صفحة البطولات، و`http://72.61.18.234:8098/admin` تفتح دخول اللوحة.
12. ✅ (2026-11-24) دخل المالك اللوحة وفعّل التحقق الثنائي بتطبيق Google Authenticator (كلمة السر الأولى من متغيرات `saha-stack` في Docker Manager ← Environment variables). **باقٍ:** تغيير كلمة السر الأولى من «حسابي».
    ~~أول دخول للوحة:~~ البريد `admin@saha.local` وكلمة السر = قيمة `ADMIN_INITIAL_PASSWORD` المحفوظة عندك من نص التشغيل ← فعّل التحقق الثنائي بالزر ← غيّر كلمة السر من «حسابي».
13. ✅ الجلسة 7 — التطبيق (الكود جاهز ومختبر في الفرع `session-7`، Pull Request رقم 7).
14. **دمج الجلسة 7 ثم تحديث السيرفر:** https://github.com/abtkare/saha/pull/7 ← **Merge pull request** ← **Confirm** ← انتظر نحو 10 دقائق (بناء الصور) ← Docker Manager ← `saha-stack` ← ⋮ ← **Update**. التحقق: ثبّت **Expo Go** من App Store، ثم افتح http://72.61.18.234:8098/app من Safari على الآيفون واضغط «افتح ساحة في Expo Go».
15. ✅ (2026-11-24) حساب Expo `appshoplive` ومشروع saha والسر EXPO_TOKEN جاهزة. ~~لتفعيل إشعارات الهاتف:~~ حساب على https://expo.dev ← Create project باسم `saha` ← انسخ **Project ID** (بصيغة xxxxxxxx-xxxx-…) واسم الحساب، وأعطهما للجلسة القادمة لتضعهما في `apps/mobile/app.json` (لا حاجة لأي تعديل على السيرفر).
16. **الجلسة 8 — إكمال:** ✅ (أ) أُصلح اختبار النسخ الاحتياطي ونجح CI كاملاً في PR #9. (ب) دمج PR #9 ثم تشغيل HTTPS والنسخ الاحتياطي على السيرفر — **الخطوات في القسم «تشغيل HTTPS والنسخ الاحتياطي من Docker Manager» أدناه**. (ج) بعد نجاح HTTPS: متغير المستودع `SAHA_WEB_URL` = `https://saha.72-61-18-234.sslip.io` (GitHub ← Settings ← Secrets and variables ← Actions ← Variables) ثم إعادة تشغيل «نشر التطبيق» على main. (د) تجربة إشعار فعلي: حسابي ← فعّل إشعارات الهاتف ← «أرسل إشعاراً تجريبياً». (هـ) TestFlight بعد حساب Apple. (و) لاحقاً: ربط 8098 على 127.0.0.1 فقط بعد HTTPS (حتى لا يُزوَّر X-Forwarded-For عبر المنفذ المباشر) — ينتظر انتقال الآيفون كلياً إلى https.

## حالة 2026-11-25 03:30 (نهاية محادثة الجلسة 8)
- ✅ PR #9 وPR #10 مدموجان. PR #10 وضع ملف التشغيل داخل صورة saha-api: `/repo/infra/docker-compose.stack.yml` (CI يتحقق أنه مطابق للمستودع).
- ✅ المالك ضغط Update في Docker Manager ← الحاويات الأربع حُدّثت (زر الإشعار التجريبي صار على الخادم). **saha-backup وsaha-edge لم تُضافا بعد** — Update لا يضيف خدمات جديدة.
- ⚠️ المالك **لا يستطيع اللصق في محرر Docker Manager من الآيفون**، ووكيل هوستنجر يرفض أوامر الكتابة المباشرة (cp/mv/`>`) ونص Compose الطويل يُقتطع عند لصقه له. الحل الحالي: نص الوكيل أدناه (أوامر Docker فقط؛ حاوية مؤقتة تنسخ الملف). **بانتظار ردّ الوكيل.**
- ❌ (03:31) **الوكيل رفض الخطوة 2، ثم رفض حتى `docker pull`**: الوكيل الآن للقراءة والفحص فقط — لا تعطه أي أمر تنفيذ. لم يتغير شيء على السيرفر.
- **الخطة التالية (نُفّذت في الجلسة 9 — انظر «الجلسة 9» أعلاه):** مشروع **منفصل جديد** في Docker Manager باسم `saha-ops` فيه خدمتا `backup` و`edge` فقط (شبكة `saha_net` الخارجية، `env_file: /docker/saha-stack/.env` بمسار مطلق، مجلد النسخ `/docker/saha-stack/backups`)، يُنشأ بزر **Compose from URL** برابط عام قصير — لا لصق ولا وكيل ولا تعديل على `saha-stack`. الرابط العام: يقدّمه saha-web (مثلاً `http://72.61.18.234:8098/ops/saha-ops.yml`) أو مصدر عام آخر؛ يحتاج PR ← دمج (بضغطة من المالك إن رُفض الدمج من الجلسة) ← Update لـ saha-stack ← Compose from URL. بعدها يُحذف `backup` و`edge` من `infra/docker-compose.stack.yml` أو يبقيان موثّقين كبديل، حتى لا تتكرر الحاويات بالاسم نفسه. تأكد أن Compose from URL يقبل http أو احتج لـ https.
- بعد نجاح HTTPS: متغير المستودع `SAHA_WEB_URL` = `https://saha.72-61-18-234.sslip.io` ← إعادة تشغيل «نشر التطبيق» على main ← تجربة «أرسل إشعاراً تجريبياً» على الآيفون ← TestFlight.

### ~~نص وكيل هوستنجر لإضافة saha-backup وsaha-edge~~ (ملغى — الوكيل رفضه، وحلّ محله saha-ops)
```text
أريد تحديث مشروع saha-stack في /docker/saha-stack فقط، بأوامر Docker وحدها، دون لمس أي حاوية أو مشروع آخر، خصوصاً «خصوصي» و«مشاوي» وsaha-preview، ودون لمس ملف .env.

1) اسحب الصورة:
docker pull ghcr.io/abtkare/saha-api:latest

2) حاوية مؤقتة تأخذ نسخة احتياطية من ملف التشغيل الحالي ثم تضع الملف الجديد الكامل من داخل الصورة (لا كتابة من الطرفية مباشرة):
docker run --rm -v /docker/saha-stack:/target --entrypoint sh ghcr.io/abtkare/saha-api:latest -c "cp /target/docker-compose.yml /target/docker-compose.yml.bak-s7 && grep -q SAHA_EDGE_REMOVE /repo/infra/docker-compose.stack.yml && cp /repo/infra/docker-compose.stack.yml /target/docker-compose.yml && echo DONE"
إن لم يطبع DONE فتوقف وأخبرني.

3) تحقق دون تشغيل:
docker compose -f /docker/saha-stack/docker-compose.yml config --services
يجب أن تظهر 6 خدمات: db redis api web backup edge. إن لم تظهر فتوقف وأخبرني.

4) شغّل:
docker compose -f /docker/saha-stack/docker-compose.yml up -d
ملاحظة: حاوية saha-edge هي التي تضيف ملف موقع واحداً لساحة في Nginx وتصدر الشهادة، وتتراجع تلقائياً إن تأثر أي موقع آخر. لا تعدّل Nginx بنفسك.

5) انتظر دقيقتين ثم أعطني:
- ناتج docker ps لحاويات saha-* فقط
- ناتج: docker logs saha-edge --tail 40
- ناتج: docker logs saha-backup --tail 10
- ناتج: curl -s https://saha.72-61-18-234.sslip.io/api/v1/health
```

## ~~تشغيل HTTPS والنسخ الاحتياطي من Docker Manager (لصق الملف)~~ (ملغى — حلّ محله «تشغيل saha-ops من Docker Manager»)
1. افتح الملف على GitHub: https://github.com/abtkare/saha/blob/main/infra/docker-compose.stack.yml ← زر النسخ (Copy raw file).
2. هوستنجر ← VPS ← Manage ← Docker Manager ← Projects ← **`saha-stack`** (ليس `saha`) ← تعديل الملف ← امسح المحتوى والصق الجديد ← **Deploy**. لا تغيّر ملف `.env`.
3. انتظر دقيقتين. يجب أن تظهر 6 حاويات: saha-db، saha-redis، saha-api، saha-web، **saha-backup**، **saha-edge**.
4. سجل `saha-edge` (Logs): سطر «المواقع الأخرى قبل أي تغيير» بأسماء مواقع خصوصي ومشاوي ورموزها، ثم «✅ الشهادة جاهزة» ثم «🎉 ساحة على https://saha.72-61-18-234.sslip.io». إن ظهر ⛔ فلم يتغير شيء في المواقع الأخرى — انسخ السجل للجلسة.
5. سجل `saha-backup`: «✅ نسخة احتياطية: /backups/saha-….sql.gz». الملفات في `/docker/saha-stack/backups` (مدير الملفات).
6. من Safari: https://saha.72-61-18-234.sslip.io و https://saha.72-61-18-234.sslip.io/api/v1/health، **ثم افتح موقعي خصوصي ومشاوي** وتأكد أنهما يعملان.
7. **طوارئ** (إن تأثر أي موقع آخر بعد ذلك لأي سبب): في نفس الملف غيّر `SAHA_EDGE_REMOVE: "0"` إلى `"1"` ← Deploy ← تحذف saha-edge ملف ساحة وحده من Nginx وتعيده كما كان. للرجوع: أعدها `"0"` ← Deploy.

## نص تشغيل ساحة الكاملة لوكيل هوستنجر (بعد جعل الحزمتين عامتين)
```text
أريد تشغيل مشروع «ساحة» الكامل في مجلد جديد مستقل، دون لمس أي حاوية أو مشروع آخر، خصوصاً «خصوصي» و«مشاوي»، ودون لمس حاوية saha-preview على المنفذ 8097.

1) أنشئ المجلد /docker/saha-stack وحمّل فيه ملف التشغيل:
   curl -fsSL -o /docker/saha-stack/docker-compose.yml https://raw.githubusercontent.com/abtkare/saha/main/infra/docker-compose.stack.yml

2) أنشئ الملف /docker/saha-stack/.env بهذا المحتوى، مع توليد كل قيمة عشوائية بالأمر openssl rand -hex 32 (قيمة مختلفة لكل سطر)، واستخدم نفس كلمة سر القاعدة في السطرين POSTGRES_PASSWORD وDATABASE_URL:
   POSTGRES_USER=saha
   POSTGRES_DB=saha
   POSTGRES_PASSWORD=<عشوائي>
   DATABASE_URL=postgresql://saha:<نفس كلمة السر>@db:5432/saha
   REDIS_URL=redis://redis:6379
   JWT_SECRET=<عشوائي>
   JWT_REFRESH_SECRET=<عشوائي>
   AUDIT_HMAC_SECRET=<عشوائي>
   OTP_PROVIDER=dev
   STORAGE_DIR=/data/uploads
   ADMIN_EMAIL=admin@saha.local
   ADMIN_INITIAL_PASSWORD=<عشوائي بطول 16 حرفاً>
   SEED_DEMO=true
   NOINDEX=true
   TZ=Asia/Baghdad
   HOST_HTTP_PORT=8098
   ثم اجعل صلاحية الملف 600.

3) تأكد أن المنفذ 8098 غير مستخدم. إن كان مستخدماً فلا تكمل وأخبرني.

4) من داخل /docker/saha-stack نفّذ: docker compose pull ثم docker compose up -d
   (الشبكة saha_net موجودة مسبقاً من حاوية المعاينة، والملف يستخدمها كما هي.)

5) انتظر دقيقة ثم أعطني:
   - ناتج docker ps لحاويات saha-db وsaha-redis وsaha-api وsaha-web فقط
   - ناتج: curl -s http://127.0.0.1:8098/api/v1/health
   - هل يعيد curl -I http://72.61.18.234:8098 الرمز 200؟
   - قيمة ADMIN_INITIAL_PASSWORD التي ولّدتها (لأحفظها عندي).
   إن فشل شيء فأعطني ناتج: docker compose logs --tail 60 api
```

## كلمة سر المدير والتحقق الثنائي
- كلمة السر الأولى = `ADMIN_INITIAL_PASSWORD` وتُرى من Docker Manager ← Projects ← `saha-stack` ← Manage ← Environment variables (.env). لا تغيّر شيئاً هناك.
- رمز الدخول من تطبيق Google Authenticator على آيفون المالك (حساب «ساحة»)، وليس برسالة نصية.

## التحديث المجاني بلا وكيل (الطريقة المعتمدة من 2026-11-23)
وكيل هوستنجر صار يطلب اشتراكاً مدفوعاً (Agent Plus) والمالك لا يريده. التحديث يتم من لوحة هوستنجر:
VPS ← Manage ← Docker Manager ← Projects ← مشروع `saha-stack` ← زر ⋮ ← **Update** (يسحب الصور الجديدة ويعيد إنشاء الحاويات، والبيانات تبقى).
التحقق من Safari: `http://72.61.18.234:8098/api/v1/health` يعيد `"status":"ok"`.
**تنبيه:** في Docker Manager مشروعان: `saha` (حاوية واحدة preview — المعاينة القديمة 8097) و`saha-stack` (أربع حاويات db وredis وapi وweb). التحديث على `saha-stack` فقط.
**مشكلة 2026-11-23:** بعد الجلسة 4 ضغط المالك Update ولم تُسحب الصور الجديدة (بقي `/api/v1/me/notifications` يعيد 404). الحل: `pull_policy: always` للحاويتين api وweb في ملف التشغيل، فيلصق المالك الملف كاملاً مرة واحدة في محرر المشروع في Docker Manager ثم يضغط Deploy. بعدها يكفي Update في كل جلسة.
رفع ملف zip إلى GitHub لا يحل هذا: الكود يصل GitHub من الجلسة مباشرة، والمشكلة كانت في سحب السيرفر للصور.
لا تضغط Update على أي مشروع آخر.

## نص تحديث ساحة الكاملة (بعد كل بناء جديد — بديل عبر الوكيل)
```text
من داخل /docker/saha-stack نفّذ: docker compose pull ثم docker compose up -d
لا تلمس أي حاوية أو مشروع آخر، خصوصاً «خصوصي» و«مشاوي».
انتظر دقيقة ثم أعطني:
- ناتج docker ps لحاويات saha-* فقط
- ناتج curl -s http://127.0.0.1:8098/api/v1/health
- ناتج curl -s http://127.0.0.1:8098/api/v1/tournaments/baghdad-sahat-2026/scorers
إن لم تصبح saha-api بحالة healthy فأعطني ناتج: docker compose logs --tail 60 api
```

## نص كشف المنفذ لوكيل هوستنجر
```text
مشروع «ساحة» يعمل الآن على 127.0.0.1:8097. أريد كشفه على المنفذ 8097 للعامة دون لمس Nginx أو أي حاوية أو مشروع آخر، خصوصاً «خصوصي» و«مشاوي».

1) في الملف /docker/saha/docker-compose.yml غيّر السطر:
      - "127.0.0.1:8097:80"
   إلى:
      - "8097:80"
   ولا تغيّر أي شيء آخر في الملف.

2) من داخل /docker/saha نفّذ: docker compose up -d
   (هذا يعيد إنشاء حاوية saha-preview فقط.)

3) إن كان هناك جدار حماية (ufw أو جدار هوستنجر) يمنع المنفذ 8097 فاسمح به وحده للبروتوكول TCP، أو أخبرني إن لم تكن لديك صلاحية.

4) أعطني: ناتج docker ps لحاوية saha-preview فقط، وهل يعيد curl -I http://72.61.18.234:8097 الرمز 200.
```

## نص تحديث المعاينة القديمة (8097) بعد تعديل apps/preview
```text
من داخل /docker/saha نفّذ: docker compose pull ثم docker compose up -d
لا تلمس أي حاوية أو مشروع آخر. أعطني ناتج docker ps لحاوية saha-preview فقط.
```

## قواعد العمل الثابتة
- الرد بالعربية. المالك يعمل من آيفون ولا يكتب أوامر.
- الرفع على GitHub مباشرة من الجلسة (لا zip). أي خطوة على السيرفر = نص جاهز لوكيل هوستنجر.
- لا تقترب من «خصوصي» و«مشاوي» وباقي المشاريع على السيرفر.
- عند طول السياق: سلّم ملف تسليم محدَّث وانتقل لمحادثة جديدة.
