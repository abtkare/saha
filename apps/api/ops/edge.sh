#!/usr/bin/env bash
# «ساحة» — HTTPS برابط sslip.io عبر Nginx الموجود على السيرفر، من حاوية Docker (saha-edge).
#
# لماذا من حاوية: وكيل هوستنجر لا يملك صلاحية /etc/nginx ولا Certbot، والمالك يعمل من Docker Manager فقط.
# الحاوية مميّزة (privileged + pid: host) وتنفّذ أوامرها على السيرفر نفسه عبر nsenter.
#
# ما تفعله (وما لا تفعله):
#   - تضيف ملف موقع واحداً جديداً لـ «ساحة» فقط ($SAHA_DOMAIN) ولا تعدّل أي ملف آخر في Nginx.
#   - قبل أي تغيير: تسجّل رمز الاستجابة لكل موقع آخر على Nginx (مثل «خصوصي» و«مشاوي»).
#     بعد كل تغيير: `nginx -t` ثم reload ثم تعيد الفحص؛ إن فشل الفحص أو تغيّر رمز أي موقع آخر ← تحذف ملفها وتعيد Nginx كما كان.
#   - الشهادة من Let's Encrypt بحاوية certbot الرسمية (webroot)، محفوظة في /docker/saha-stack/letsencrypt.
#   - تبقى تعمل: تجدد الشهادة كل 12 ساعة (certbot لا يجددها إلا قبل انتهائها بـ 30 يوماً) وتعيد تحميل Nginx عند التجديد فقط.
#
# المتغيرات: SAHA_DOMAIN (إلزامي) · SAHA_UPSTREAM (127.0.0.1:8098) · SAHA_DIR (/docker/saha-stack)
#            SAHA_ACME=letsencrypt|selfsigned (selfsigned للاختبار في CI فقط) · SAHA_EDGE_ONCE=1 (للاختبار: نفّذ ثم اخرج)
set -uo pipefail

D="${SAHA_DOMAIN:?SAHA_DOMAIN مطلوب}"
UP="${SAHA_UPSTREAM:-127.0.0.1:8098}"
DIR="${SAHA_DIR:-/docker/saha-stack}"
ACME="${SAHA_ACME:-letsencrypt}"
LE="$DIR/letsencrypt"
WEBROOT="$DIR/acme-webroot"
CERT="$LE/live/$D/fullchain.pem"
KEY="$LE/live/$D/privkey.pem"
MARK="# saha-edge: managed file for $D"

log() { echo "[$(TZ=Asia/Baghdad date '+%F %T')] $*"; }
# تنفيذ أمر على السيرفر نفسه (كل مساحات الأسماء للعملية 1)
H() { nsenter -t 1 -m -u -i -n -p -- "$@"; }
stop_here() {
  log "⛔ $*"
  log "لم يتغير شيء في المواقع الأخرى. الحاوية ستبقى متوقفة عن العمل حتى إصلاح السبب (أعد تشغيلها من Docker Manager)."
  [ "${SAHA_EDGE_ONCE:-}" = 1 ] && exit 1
  exec sleep infinity
}

# ---------- فحوص أولية ----------
H true 2>/dev/null || stop_here "لا أستطيع الوصول إلى السيرفر من الحاوية (يلزم privileged و pid: host)."
H sh -c 'command -v nginx' >/dev/null || stop_here "لم أجد Nginx على السيرفر."
H nginx -t >/dev/null 2>&1 || stop_here "إعداد Nginx الحالي فيه خطأ قبل أي تغيير مني — لن ألمسه. (nginx -t)"

# مكان ملف الموقع: conf.d إن كان مضمَّناً، وإلا sites-enabled
NGX_T="$(H nginx -T 2>/dev/null)"
if grep -Eq 'include[[:space:]]+/etc/nginx/conf\.d/\*\.conf' <<<"$NGX_T"; then
  CONF=/etc/nginx/conf.d/saha-sslip.conf
elif grep -Eq 'include[[:space:]]+/etc/nginx/sites-enabled/\*' <<<"$NGX_T"; then
  CONF=/etc/nginx/sites-enabled/saha-sslip.conf
else
  stop_here "لم أجد مجلد مواقع مضمَّناً في Nginx (conf.d أو sites-enabled)."
fi
log "ملف موقع ساحة: $CONF"

# إن كان الملف موجوداً وليس من صنعنا فلا نلمسه
if H test -e "$CONF" && ! H grep -qF "$MARK" "$CONF"; then
  stop_here "الملف $CONF موجود وليس من صنع saha-edge — لن أكتب فوقه."
fi
# النطاق مستخدم في موقع آخر؟
OTHER_DEF="$(H sh -c "grep -rlE 'server_name[^;]*[[:space:]]$D([[:space:];])' /etc/nginx 2>/dev/null | grep -vx '$CONF'" || true)"
[ -n "$OTHER_DEF" ] && stop_here "النطاق $D معرَّف مسبقاً في: $OTHER_DEF — لن أضيف تعريفاً ثانياً."

IPV6=0; grep -Eq 'listen[[:space:]]+\[::\]' <<<"$NGX_T" && IPV6=1

# ---------- لقطة المواقع الأخرى ----------
# server_name في أي مكان من السطر (بعض الملفات تكتب الكتلة في سطر واحد)، مع تجاهل التعليقات
OTHERS="$(sed 's/#.*$//' <<<"$NGX_T" | grep -oE '(^|[[:space:];{])server_name[[:space:]]+[^;]+' | sed -E 's/^.*server_name[[:space:]]+//' | tr ' \t' '\n\n' \
  | grep -Ev '^$|^_$|[*~^$()]|^localhost$' | grep -vxF "$D" | sort -u | head -40)"
probe() { # host scheme → رمز الاستجابة (من السيرفر نفسه عبر 127.0.0.1)
  local port=80; [ "$2" = https ] && port=443
  H curl -s -k -o /dev/null --max-time 8 -w '%{http_code}' --resolve "$1:$port:127.0.0.1" "$2://$1/" 2>/dev/null || echo 000
}
snapshot() {
  local h
  for h in $OTHERS; do echo "$h http=$(probe "$h" http) https=$(probe "$h" https)"; done
}
BEFORE="$(snapshot)"
log "المواقع الأخرى قبل أي تغيير:"; [ -n "$BEFORE" ] && echo "$BEFORE" | sed 's/^/    /' || echo "    (لا توجد)"

# ---------- كتابة الإعداد ----------
proxy_block() {
  cat <<EOF
    client_max_body_size 12m;
    location / {
        proxy_pass http://$UP;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_read_timeout 120s;
        proxy_buffering off;
    }
EOF
}
render() { # $1 = http | https
  local v6l80="" v6l443=""
  [ $IPV6 = 1 ] && v6l80="    listen [::]:80;" && v6l443="    listen [::]:443 ssl;"
  echo "$MARK"
  echo "# لا تعدّل هذا الملف يدوياً: تكتبه حاوية saha-edge (apps/api/ops/edge.sh في مستودع abtkare/saha)."
  echo "server {"
  echo "    listen 80;"
  [ -n "$v6l80" ] && echo "$v6l80"
  echo "    server_name $D;"
  echo "    location ^~ /.well-known/acme-challenge/ { root $WEBROOT; default_type text/plain; }"
  if [ "$1" = https ]; then
    echo '    location / { return 301 https://$host$request_uri; }'
    echo "}"
    echo "server {"
    echo "    listen 443 ssl;"
    [ -n "$v6l443" ] && echo "$v6l443"
    echo "    server_name $D;"
    echo "    ssl_certificate $CERT;"
    echo "    ssl_certificate_key $KEY;"
    echo "    ssl_protocols TLSv1.2 TLSv1.3;"
    echo "    ssl_session_cache shared:saha_ssl:5m;"
    echo '    add_header Strict-Transport-Security "max-age=31536000" always;'
    proxy_block
  else
    proxy_block
  fi
  echo "}"
}

rollback() {
  if [ -n "${PREV_FILE:-}" ]; then H sh -c "cat > '$CONF'" <<<"$PREV_FILE"; else H rm -f "$CONF"; fi
  H nginx -t >/dev/null 2>&1 && H nginx -s reload
}

apply() { # $1 = http | https
  local new; new="$(render "$1")"
  PREV_FILE=""
  if H test -e "$CONF"; then
    PREV_FILE="$(H cat "$CONF")"
    if [ "$PREV_FILE" = "$new" ]; then log "إعداد $1 موجود كما هو — لا تغيير."; return 0; fi
  fi
  H sh -c "cat > '$CONF'" <<<"$new"
  local t; t="$(H nginx -t 2>&1)" || { echo "$t" | sed 's/^/    /'; rollback; stop_here "nginx -t رفض إعداد ساحة ($1) فحذفته وأعدت Nginx كما كان."; }
  H nginx -s reload
  sleep 2
  local after; after="$(snapshot)"
  if [ "$after" != "$BEFORE" ]; then
    log "تغيّر رمز موقع آخر بعد التغيير:"; diff <(echo "$BEFORE") <(echo "$after") | sed 's/^/    /'
    rollback
    stop_here "أعدت Nginx كما كان لأن موقعاً آخر تأثر."
  fi
  log "✅ طُبّق إعداد $1، والمواقع الأخرى كما هي."
}

# ---------- الشهادة ----------
certbot() {
  H docker run --rm --name saha-certbot \
    -v "$LE:/etc/letsencrypt" -v "$WEBROOT:$WEBROOT" -v "$LE/log:/var/log/letsencrypt" \
    certbot/certbot:latest "$@"
}
cert_ok() { H test -s "$CERT" && H test -s "$KEY"; }
issue() {
  if [ "$ACME" = selfsigned ]; then
    H mkdir -p "$LE/live/$D"
    H openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=$D" -addext "subjectAltName=DNS:$D" \
      -keyout "$KEY" -out "$CERT" >/dev/null 2>&1
    return
  fi
  certbot certonly --webroot -w "$WEBROOT" -d "$D" --agree-tos --register-unsafely-without-email \
    --non-interactive --keep-until-expiring --preferred-challenges http
}

H mkdir -p "$WEBROOT/.well-known/acme-challenge" "$LE"

if ! cert_ok; then
  log "لا توجد شهادة بعد ← إعداد HTTP مؤقت لإثبات ملكية النطاق"
  apply http
  # فحص أن الطلب على النطاق يصل لهذا السيرفر (sslip.io يحوّل الاسم إلى الـ IP)
  tok="saha-$(date +%s)"; H sh -c "echo $tok > '$WEBROOT/.well-known/acme-challenge/$tok'"
  got="$(H curl -s --max-time 10 "http://$D/.well-known/acme-challenge/$tok" || true)"
  H rm -f "$WEBROOT/.well-known/acme-challenge/$tok"
  [ "$got" = "$tok" ] && log "النطاق $D يصل إلى هذا السيرفر ✓" || log "تنبيه: لم أستطع فحص النطاق من السيرفر نفسه (قد يكون طبيعياً) — أكمل."
  log "طلب الشهادة ($ACME)…"
  issue || { stop_here "فشل إصدار الشهادة. ساحة تبقى على http://$D مؤقتاً. راجع السطور أعلاه."; }
  cert_ok || stop_here "لم أجد ملفات الشهادة بعد الإصدار."
  log "✅ الشهادة جاهزة."
fi

apply https
k=""; [ "$ACME" = selfsigned ] && k="-k"
code="$(H curl -s $k -o /dev/null --max-time 10 -w '%{http_code}' --resolve "$D:443:127.0.0.1" "https://$D/api/v1/health" || true)"
log "فحص https://$D/api/v1/health ← $code"
log "🎉 ساحة على https://$D"

[ "${SAHA_EDGE_ONCE:-}" = 1 ] && exit 0

# ---------- التجديد ----------
while true; do
  sleep 43200
  [ "$ACME" = selfsigned ] && continue
  before="$(H stat -c %Y "$CERT" 2>/dev/null || echo 0)"
  certbot renew --webroot -w "$WEBROOT" --non-interactive >/dev/null 2>&1 || log "تنبيه: فشل فحص التجديد — سأحاول بعد 12 ساعة."
  after="$(H stat -c %Y "$CERT" 2>/dev/null || echo 0)"
  if [ "$before" != "$after" ]; then
    H nginx -t >/dev/null 2>&1 && H nginx -s reload && log "✅ جُدّدت الشهادة وأُعيد تحميل Nginx."
  fi
done
