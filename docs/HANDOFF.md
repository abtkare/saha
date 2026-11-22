# ملف تسليم الجلسة — مشروع «ساحة»

آخر تحديث: 2026-11-22

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
- **الرابط المؤقت:** https://saha.72-61-18-234.sslip.io

## خطوات معلّقة (بالترتيب)
1. جعل الحزمة عامة: https://github.com/users/abtkare/packages/container/saha-preview/settings ← Change visibility ← Public.
2. إعطاء وكيل هوستنجر نص النشر (أدناه) ونسخ ردّه.
3. التأكد أن الرابط يفتح بـ HTTPS وأن باقي المشاريع تعمل كما هي.
4. بعدها: «الجلسة 1 — الأساس» من `docs/PLAN.md` (monorepo بـ pnpm + Turborepo، NestJS، Next.js في `apps/web` يحل محل `apps/preview`، Prisma + سجل التدقيق، Expo لاحقاً).
   - تعديل لازم على الخطة: جدول `tournaments` يحتاج حقل نوع البطولة (فرق شعبية / متابعو مؤثر / مجموعة فيسبوك) وربطاً اختيارياً بحساب المؤثر أو المجموعة.

## نص النشر لوكيل هوستنجر
```text
أريد نشر مشروع جديد اسمه «ساحة» دون لمس أي شيء آخر. ممنوع إيقاف أو حذف أو تعديل أي حاوية أو ملف إعداد موجود، خصوصاً مشروعي «خصوصي» و«مشاوي» وكل مواقع Nginx الحالية.

1) تأكد أن المنفذ 8097 غير مستخدم. إن كان مستخدماً توقف وأخبرني.

2) أنشئ المجلد /docker/saha وضع فيه ملف docker-compose.yml بهذا المحتوى حرفياً:
name: saha
services:
  preview:
    image: ghcr.io/abtkare/saha-preview:latest
    container_name: saha-preview
    restart: unless-stopped
    ports:
      - "127.0.0.1:8097:80"
    networks:
      - saha_net
    mem_limit: 128m
networks:
  saha_net:
    name: saha_net

ثم من داخل /docker/saha نفّذ: docker compose pull ثم docker compose up -d
وتأكد أن الأمر curl -I http://127.0.0.1:8097 يعيد 200.

3) أنشئ ملف موقع Nginx جديد /etc/nginx/sites-available/saha.conf بهذا المحتوى:
server {
    listen 80;
    listen [::]:80;
    server_name saha.72-61-18-234.sslip.io;
    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:8097;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
إذا كان السيرفر يستخدم /etc/nginx/conf.d بدل sites-available فضع الملف هناك باسم saha.conf، وإلا اربطه برابط رمزي في /etc/nginx/sites-enabled/saha.conf.

4) نفّذ nginx -t. إن ظهر أي خطأ احذف ملف saha.conf فقط وتوقف وأخبرني بالخطأ. إن نجح نفّذ systemctl reload nginx (إعادة تحميل وليس إعادة تشغيل).

5) أصدر شهادة HTTPS لهذا النطاق وحده:
certbot --nginx -d saha.72-61-18-234.sslip.io --redirect --non-interactive --agree-tos -m abtkare87@gmail.com
إن لم يكن certbot مثبتاً أخبرني قبل تثبيته.

6) أعطني النتيجة: هل يفتح الرابط https://saha.72-61-18-234.sslip.io برمز 200؟ وتأكد أن مواقع «خصوصي» و«مشاوي» وباقي المشاريع ما زالت تعمل كما كانت.
```

## نص تحديث النشر لاحقاً (بعد كل بناء جديد)
```text
من داخل /docker/saha نفّذ: docker compose pull ثم docker compose up -d
لا تلمس أي حاوية أو مشروع آخر. أعطني ناتج docker ps لحاوية saha-preview فقط.
```

## قواعد العمل الثابتة
- الرد بالعربية. المالك يعمل من آيفون ولا يكتب أوامر.
- الرفع على GitHub مباشرة من الجلسة (لا zip). أي خطوة على السيرفر = نص جاهز لوكيل هوستنجر.
- لا تقترب من «خصوصي» و«مشاوي» وباقي المشاريع على السيرفر.
- عند طول السياق: سلّم ملف تسليم محدَّث وانتقل لمحادثة جديدة.
