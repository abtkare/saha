# ملف تسليم الجلسة — مشروع «ساحة»

آخر تحديث: 2026-11-23

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

## حالة النشر (2026-11-22)
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

## خطوات معلّقة (بالترتيب)
1. **المالك:** هل يفتح `http://72.61.18.234:8097` من Safari؟ (لم يُجب بعد). إن لم يفتح: حل عبر Docker (لا UFW).
2. **المالك من GitHub:** جعل الحزمتين `saha-api` و`saha-web` عامتين (Package settings ← Change visibility ← Public):
   - https://github.com/users/abtkare/packages/container/saha-api/settings
   - https://github.com/users/abtkare/packages/container/saha-web/settings
3. **وكيل هوستنجر:** «نص تشغيل ساحة الكاملة» أدناه ← الرابط `http://72.61.18.234:8098`.
4. **الجلسة 2 — الدخول والأدوار:** OTP (مزوّد `dev` = 000000)، الجلسات بجدول `sessions` (هاش الرمز فقط)، ولي الأمر (`users.guardian_id` و`players.guardian_id`)، TOTP للإدارة (كلمة السر بصيغة `scrypt$salt$hash` كما في `prisma/seed.ts`)، Rate Limit بـ Redis، مصفوفة الصلاحيات (`user_roles` بنطاق بطولة/فريق)، تقييد Swagger للمديرين، و`GET /admin/audit/verify`.

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

## نص تحديث ساحة الكاملة (بعد كل بناء جديد)
```text
من داخل /docker/saha-stack نفّذ: docker compose pull ثم docker compose up -d
لا تلمس أي حاوية أو مشروع آخر. أعطني ناتج docker ps لحاويات saha-* فقط، وناتج curl -s http://127.0.0.1:8098/api/v1/health
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
