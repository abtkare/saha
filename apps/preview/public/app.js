// ساحة — نسخة المعاينة الأولى (بيانات تجريبية للعرض فقط)
(function () {
  // شاشة البداية: تظهر مرة واحدة في كل جلسة، واللمس يتخطاها
  var splash = document.getElementById('splash');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seen = false;
  try { seen = sessionStorage.getItem('saha_splash') === '1'; } catch (e) {}
  function hide() {
    if (!splash || splash.classList.contains('out')) return;
    splash.classList.add('out');
    document.body.classList.remove('locked');
    try { sessionStorage.setItem('saha_splash', '1'); } catch (e) {}
  }
  if (seen) { splash.remove(); }
  else {
    document.body.classList.add('locked');
    splash.addEventListener('click', hide);
    setTimeout(hide, reduce ? 900 : 3900);
  }

  // الوضع الداكن: زر في الرأس، والاختيار يُحفظ في المتصفح
  var themeBtn = document.getElementById('themeBtn');
  function syncTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    themeBtn.setAttribute('aria-label', dark ? 'الوضع الفاتح' : 'الوضع الداكن');
  }
  if (themeBtn) {
    syncTheme();
    themeBtn.addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
      if (dark) document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme');
      try { localStorage.setItem('saha_theme', dark ? 'dark' : 'light'); } catch (e) {}
      syncTheme();
    });
  }

  var STATUS = {
    provisional: 'مؤقتة', confirmed: 'معتمدة', disputed: 'متنازع عليها', final: 'نهائية', scheduled: 'لم تبدأ'
  };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function m(tour, home, away, score, st, time, venue) { return { tour: tour, home: home, away: away, score: score, st: st, time: time, venue: venue }; }

  var DAYS = [
    [m('كأس الحارات', 'أسود الكوفة', 'فرسان الشعلة', '3 – 2', 'final', '18:00', 'ملعب الكوفة الشعبي'),
     m('بطولة جمهور [اسم المؤثر]', 'فريق المتابعين أ', 'فريق المتابعين ب', '1 – 1', 'disputed', '16:30', 'ساحة الحلة')],
    [m('بطولة الساحات', 'نجوم الكرادة', 'شباب العلاوي', '2 – 1', 'provisional', '16:00', 'ساحة الكرادة'),
     m('بطولة الساحات', 'أسود الكوفة', 'صقور الحلة', '0 – 0', 'confirmed', '17:30', 'ملعب الكوفة الشعبي'),
     m('كأس مجموعة [اسم المجموعة]', 'أعضاء بغداد', 'أعضاء البصرة', '– : –', 'scheduled', '19:00', 'ساحة الشعلة')],
    [m('بطولة الساحات', 'صقور الحلة', 'نجوم الكرادة', '– : –', 'scheduled', '17:00', 'ساحة الحلة'),
     m('بطولة جمهور [اسم المؤثر]', 'فريق المتابعين ج', 'فريق المتابعين د', '– : –', 'scheduled', '18:30', 'ساحة بابل')]
  ];

  var TOURS = [
    { name: 'بطولة الساحات', kind: 'فرق شعبية', city: 'بغداد', teams: 16, format: 'مجموعات + خروج', pct: 45, round: 'الجولة 3 من 7' },
    { name: 'بطولة جمهور [اسم المؤثر]', kind: 'متابعو مؤثر', city: 'الحلة', teams: 8, format: 'خروج المغلوب', pct: 60, round: 'نصف النهائي' },
    { name: 'كأس مجموعة [اسم المجموعة]', kind: 'مجموعة فيسبوك', city: 'النجف', teams: 10, format: 'دوري', pct: 25, round: 'الجولة 2 من 9' }
  ];

  var TABLE = [
    ['نجوم الكرادة', 3, '+5', 9], ['أسود الكوفة', 3, '+3', 7], ['شباب العلاوي', 3, '+1', 4], ['صقور الحلة', 3, '−2', 3], ['فرسان الشعلة', 2, '−3', 1]
  ];

  var NEWS = [
    { t: 'انطلاق التسجيل في بطولة [اسم البطولة]', w: 'منذ ساعتين' },
    { t: 'بطولة خاصة لمتابعي [اسم المؤثر] — التسجيل عبر التطبيق', w: 'أمس' },
    { t: 'لجنة الانضباط تبتّ في اعتراض مباراة الجولة الثانية', w: 'قبل 3 أيام' }
  ];

  var trophy = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/></svg>';

  function renderMatches(day) {
    document.getElementById('matchGrid').innerHTML = DAYS[day].map(function (x) {
      return '<a href="#" class="card match">' +
        '<div class="between"><span class="muted">' + esc(x.tour) + '</span><span class="badge s-' + x.st + '">' + STATUS[x.st] + '</span></div>' +
        '<div class="vs"><b>' + esc(x.home) + '</b><span class="num score">' + esc(x.score) + '</span><b>' + esc(x.away) + '</b></div>' +
        '<div class="meta"><span class="num">' + esc(x.time) + '</span><span>' + esc(x.venue) + '</span></div></a>';
    }).join('');
  }

  document.getElementById('tourGrid').innerHTML = TOURS.map(function (t) {
    return '<a href="#" class="card tour"><span class="ico">' + trophy + '</span>' +
      '<span class="kind">' + esc(t.kind) + '</span><h3>' + esc(t.name) + '</h3>' +
      '<span class="muted">' + esc(t.city) + ' · ' + t.teams + ' فرق · ' + esc(t.format) + '</span>' +
      '<span class="progress"><i style="width:' + t.pct + '%"></i></span><span class="muted">' + esc(t.round) + '</span></a>';
  }).join('');

  document.getElementById('tableBody').innerHTML = TABLE.map(function (r, i) {
    return '<tr' + (i === 0 ? ' class="first"' : '') + '><td class="num">' + (i + 1) + '</td><td>' + esc(r[0]) + '</td><td class="num">' + r[1] + '</td><td class="num">' + r[2] + '</td><td class="num pts">' + r[3] + '</td></tr>';
  }).join('');

  document.getElementById('newsGrid').innerHTML = NEWS.map(function (n) {
    return '<a href="#" class="card news"><span class="thumb">[صورة الخبر]</span><span class="body"><b>' + esc(n.t) + '</b><span class="muted">' + esc(n.w) + '</span></span></a>';
  }).join('');

  var tabs = document.querySelectorAll('.tabs button');
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (o) { o.setAttribute('aria-selected', o === b ? 'true' : 'false'); });
      renderMatches(Number(b.getAttribute('data-day')));
    });
  });
  renderMatches(1);
})();
