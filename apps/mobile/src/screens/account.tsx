/** حسابي، الدخول برقم الهاتف، العائلة (ولي الأمر)، الإشعارات، والبحث */
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { isMinor, normalizeIraqiPhone, TOURNAMENT_KIND_LABELS } from '@saha/shared';
import { api, type Tokens } from '../api';
import { useAuth } from '../auth';
import { TourCard } from '../components/cards';
import { Icon, Mark } from '../components/icons';
import { TabHeader, TopBar } from '../components/layout';
import { Button, Card, Chip, Divider, Empty, ErrorBox, Field, ListRow, Loading, Notice, ScrollPage, Section, Tabs } from '../components/ui';
import { BUILD, WEB_URL } from '../config';
import { relativeTime } from '../format';
import { errMsg, useLoad } from '../hooks';
import { useNav } from '../nav';
import { pathFromData } from '../push';
import { row, T, useTheme, type Mode } from '../theme';
import type { Child, Notification, TournamentSummary, Ward } from '../types';
import { SignInCard } from './teams';

export function AccountScreen() {
  const { c, mode, setMode } = useTheme();
  const { push } = useNav();
  const { me, signOut, reload, push: pushState, enablePush, unread } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const [testMsg, setTestMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const sendTestPush = async () => {
    setTestMsg(null);
    try {
      const r = await api<{ devices: number }>('/me/notifications/test', { method: 'POST' });
      setTestMsg(r.devices
        ? { tone: 'ok', text: 'أُرسل. يصلك الإشعار خلال ثوانٍ — جرّب أيضاً إغلاق التطبيق أو قفل الشاشة.' }
        : { tone: 'error', text: 'لم يُسجَّل أي جهاز لحسابك بعد. اضغط «فعّل إشعارات الهاتف» أولاً.' });
    } catch (e) { setTestMsg({ tone: 'error', text: errMsg(e) }); }
  };

  const saveName = async () => {
    setMsg(null);
    try { await api('/me', { method: 'PATCH', body: { fullName: name } }); await reload(); setName(null); setMsg({ tone: 'ok', text: 'حُفظ الاسم.' }); } catch (e) { setMsg({ tone: 'error', text: errMsg(e) }); }
  };
  const remove = () => Alert.alert('حذف الحساب نهائياً؟', 'تُمحى بياناتك الشخصية وتخرج من كل الأجهزة. لا يمكن التراجع.', [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'احذف حسابي', style: 'destructive', onPress: async () => { try { await api('/me', { method: 'DELETE' }); await signOut(); } catch (e) { setMsg({ tone: 'error', text: errMsg(e) }); } } },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title="حسابي" />
      <ScrollPage onRefresh={() => void reload()}>
        {msg && <View style={{ padding: 16, paddingBottom: 0 }}><Notice tone={msg.tone}>{msg.text}</Notice></View>}
        {!me ? <View style={{ padding: 16 }}><SignInCard text="سجّل الدخول لتسجيل فريقك ومتابعة مبارياتك" /></View> : (
          <>
            <Section>
              <Card style={{ padding: 16, gap: 12 }}>
                <View style={{ flexDirection: row, alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <T v="num" size={22} color={c.onPrimary}>{me.fullName.charAt(0)}</T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="h3">{me.fullName}</T>
                    <T v="small" muted>{[me.phone?.replace('+964', '0'), me.birthYear ? `مواليد ${me.birthYear}` : null].filter(Boolean).join(' · ')}</T>
                  </View>
                </View>
                {me.roles.length > 0 && <View style={{ flexDirection: row, gap: 6, flexWrap: 'wrap' }}>{[...new Set(me.roles.map((r) => r.label))].map((l) => <Chip key={l}>{l}</Chip>)}</View>}
                {me.status === 'pending_guardian' && <Notice tone="warn">حسابك بانتظار موافقة ولي أمرك.</Notice>}
                {name === null ? <Button title="عدّل الاسم" kind="light" small onPress={() => setName(me.fullName)} /> : (
                  <>
                    <Field label="الاسم" value={name} onChangeText={setName} maxLength={60} />
                    <View style={{ flexDirection: row, gap: 8 }}>
                      <Button title="احفظ" small style={{ flex: 1 }} onPress={saveName} />
                      <Button title="إلغاء" kind="light" small style={{ flex: 1 }} onPress={() => setName(null)} />
                    </View>
                  </>
                )}
              </Card>
            </Section>

            <Section title="الإشعارات">
              <Card flush>
                <ListRow title="كل الإشعارات" subtitle={unread ? `${unread} غير مقروءة` : 'لا جديد'} icon="bell" onPress={() => push({ name: 'notifications' })} />
                <Divider />
                <View style={{ padding: 16, gap: 10 }}>
                  {pushState?.ok ? (
                    <>
                      <Notice tone="ok">إشعارات الهاتف مفعّلة على هذا الجهاز.</Notice>
                      <Button title="أرسل إشعاراً تجريبياً" icon="bell" small kind="secondary" onPress={sendTestPush} />
                      {testMsg && <Notice tone={testMsg.tone}>{testMsg.text}</Notice>}
                    </>
                  ) : (
                    <>
                      {pushState && <T v="small" muted>{pushState.message}</T>}
                      <Button title="فعّل إشعارات الهاتف" icon="bell" small kind="secondary" onPress={async () => { await enablePush(); }} />
                    </>
                  )}
                </View>
              </Card>
            </Section>

            <Section title="الجوائز">
              <Card flush>
                <ListRow title="جوائزي" subtitle="جوائزك وجوائز فريقك، وتأكيد الاستلام" icon="trophy" onPress={() => push({ name: 'myPrizes' })} />
                <Divider />
                <ListRow title="سجل الجوائز" subtitle="جوائز البطولات السابقة وفائزوها" icon="flag" onPress={() => push({ name: 'prizeArchive' })} />
              </Card>
            </Section>

            <Section title="الرعاية">
              <Card flush>
                <ListRow title="اطلب رعاية بطولة أو مباراة" subtitle="شريحتك في الشاشة الرئيسية لجمهور ساحة" icon="trophy" onPress={() => push({ name: 'sponsorRequest' })} />
                <Divider />
                <ListRow title="طلبات الرعاية" subtitle="الحالة، ومدة العرض، وبوابة الراعي" icon="flag" onPress={() => push({ name: 'sponsorRequests' })} />
              </Card>
            </Section>

            <Section title="العائلة">
              <Card flush><ListRow title="الأبناء وموافقة ولي الأمر" subtitle="لاعبون دون 18 سنة، والموافقة على الصور" icon="child" onPress={() => push({ name: 'family' })} /></Card>
            </Section>
          </>
        )}

        <Section title="المظهر">
          <Tabs<Mode> items={[{ key: 'system', label: 'حسب الهاتف' }, { key: 'light', label: 'فاتح' }, { key: 'dark', label: 'داكن' }]} value={mode} onChange={setMode} />
        </Section>

        <Section title="عن ساحة">
          <Card flush>
            <ListRow title="الشروط والأحكام" icon="info" onPress={() => push({ name: 'page', slug: 'terms' })} />
            <Divider />
            <ListRow title="سياسة الخصوصية" icon="shield" onPress={() => push({ name: 'page', slug: 'privacy' })} />
            <Divider />
            <ListRow title="اتصل بنا" icon="link" onPress={() => push({ name: 'page', slug: 'contact' })} />
            {me && (
              <>
                <Divider />
                <ListRow title="تسجيل الخروج" icon="logout" onPress={() => void signOut()} />
                <Divider />
                <ListRow title="حذف الحساب" icon="trash" danger onPress={remove} />
              </>
            )}
          </Card>
          <View style={{ alignItems: 'center', gap: 4, paddingTop: 8 }}>
            <Mark size={36} color={c.primary} />
            <T v="tiny" muted center>{`ساحة · كل جمهور يستحق بطولته · ${BUILD}`}</T>
            <T v="tiny" muted center>{WEB_URL.replace(/^https?:\/\//, '')}</T>
          </View>
        </Section>
      </ScrollPage>
    </View>
  );
}

/** الدخول: رقم الهاتف ← رمز من 6 أرقام ← الاسم وسنة الميلاد (ورقم ولي الأمر دون 18) */
export function LoginScreen() {
  const { c } = useTheme();
  const { pop } = useNav();
  const { signIn } = useAuth();
  const [step, setStep] = useState<'phone' | 'code' | 'profile'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [p, setP] = useState({ fullName: '', birthYear: '', guardianPhone: '' });
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const minor = /^\d{4}$/.test(p.birthYear) && isMinor(Number(p.birthYear));

  const request = async () => {
    setError(null);
    if (!normalizeIraqiPhone(phone)) { setError('اكتب رقم هاتف عراقي صحيح، مثل 07712345678.'); return; }
    try {
      const r = await api<{ expiresInSec: number; devHint?: boolean }>('/auth/otp/request', { auth: false, body: { phone } });
      setHint(r.devHint ? 'وضع التجربة: الرمز هو 000000 (قبل ربط مزوّد الرسائل).' : `أرسلنا رمزاً من 6 أرقام إلى رقمك، صالحاً ${Math.round(r.expiresInSec / 60)} دقائق.`);
      setStep('code');
    } catch (e) { setError(errMsg(e)); }
  };
  const verify = async (extra: Record<string, unknown> = {}) => {
    setError(null);
    try {
      const r = await api<{ status: string } & Partial<Tokens>>('/auth/otp/verify', { auth: false, body: { phone, code, ...extra } });
      if (r.status === 'profile_required') { setStep('profile'); return; }
      await signIn({ accessToken: r.accessToken!, refreshToken: r.refreshToken! });
      if (r.status === 'pending_guardian') Alert.alert('أُنشئ حسابك', 'حسابك بانتظار موافقة ولي أمرك. أرسلنا له رسالة، وعليه الدخول برقمه والموافقة.');
      pop();
    } catch (e) { setError(errMsg(e)); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="الدخول" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 6, paddingVertical: 12 }}>
            <Mark size={72} color={c.primary} />
            <T v="h1" center>ساحة</T>
            <T muted center>كل جمهور يستحق بطولته</T>
          </View>
          {error && <Notice tone="error">{error}</Notice>}
          {hint && step !== 'phone' && <Notice>{hint}</Notice>}
          {step === 'phone' && (
            <>
              <Field label="رقم الهاتف" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07xxxxxxxxx" autoFocus textContentType="telephoneNumber" />
              <Button title="أرسل الرمز" onPress={request} />
            </>
          )}
          {step === 'code' && (
            <>
              <Field label="رمز التحقق" value={code} onChangeText={(v) => setCode(v.replace(/[^0-9٠-٩]/g, '').slice(0, 6))} keyboardType="number-pad" autoFocus textContentType="oneTimeCode" style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }} />
              <Button title="تحقق" onPress={() => verify()} disabled={code.length !== 6} />
              <Button title="غيّر الرقم" kind="light" small onPress={() => { setStep('phone'); setCode(''); }} />
            </>
          )}
          {step === 'profile' && (
            <>
              <T v="h3">حساب جديد</T>
              <Field label="الاسم الكامل" value={p.fullName} onChangeText={(v) => setP({ ...p, fullName: v })} maxLength={60} textContentType="name" />
              <Field label="سنة الميلاد" value={p.birthYear} onChangeText={(v) => setP({ ...p, birthYear: v.replace(/[^0-9]/g, '').slice(0, 4) })} keyboardType="number-pad" placeholder="مثال: 1998" hint="لا تُعدَّل بعد الحفظ." />
              {minor && <Field label="رقم هاتف ولي الأمر" value={p.guardianPhone} onChangeText={(v) => setP({ ...p, guardianPhone: v })} keyboardType="phone-pad" hint="عمرك أقل من 18: لا يُفعّل حسابك إلا بموافقة ولي أمرك." />}
              <Button title="أنشئ حسابي" onPress={() => verify({ fullName: p.fullName.trim(), birthYear: Number(p.birthYear), ...(minor ? { guardianPhone: p.guardianPhone } : {}) })} disabled={p.fullName.trim().length < 2 || p.birthYear.length !== 4} />
              <T v="small" muted center>بإنشاء الحساب توافق على الشروط وسياسة الخصوصية.</T>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** ولي الأمر: موافقة على حسابات القاصرين، والأبناء بلا حساب وموافقة الصور وضمّهم لفريق */
export function FamilyScreen() {
  const { c } = useTheme();
  const page = useLoad(async () => {
    const [wards, children] = await Promise.all([api<Ward[]>('/me/wards'), api<Child[]>('/me/children')]);
    return { wards, children };
  });
  const [f, setF] = useState({ firstName: '', birthYear: '', consent: false });
  const [join, setJoin] = useState<{ id: number; code: string } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'ok', text: ok }); await page.reload(); } catch (e) { setMsg({ tone: 'error', text: errMsg(e) }); }
  };
  const d = page.data;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="العائلة" />
      <ScrollPage onRefresh={page.refresh} refreshing={page.refreshing}>
        {msg && <View style={{ padding: 16, paddingBottom: 0 }}><Notice tone={msg.tone}>{msg.text}</Notice></View>}
        {page.loading && !d ? <Loading /> : !d ? <View style={{ padding: 16 }}><ErrorBox message={page.error ?? ''} onRetry={page.refresh} /></View> : (
          <>
            {d.wards.length > 0 && (
              <Section title="حسابات تنتظر موافقتك">
                {d.wards.map((w) => (
                  <Card key={w.id} style={{ padding: 14, gap: 10 }}>
                    <T v="bodyB">{w.fullName}</T>
                    <T v="small" muted>{`مواليد ${w.birthYear ?? '—'} · ${w.status === 'active' ? 'مفعّل' : 'بانتظار موافقتك'}`}</T>
                    {w.status === 'pending_guardian' && <Button title="أوافق" small icon="check" onPress={() => run(() => api(`/me/wards/${w.id}/approve`, { method: 'POST' }), 'فُعّل حساب ابنك.')} />}
                  </Card>
                ))}
              </Section>
            )}
            <Section title="أبنائي (بلا حساب)">
              {d.children.length ? d.children.map((ch) => (
                <Card key={ch.id} style={{ padding: 14, gap: 10 }}>
                  <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <T v="bodyB">{ch.firstName}</T>
                      <T v="small" muted>{[`مواليد ${ch.birthYear}`, ...ch.teams.map((t) => t.team.nameAr)].join(' · ')}</T>
                    </View>
                  </View>
                  <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}>
                    <T v="small" style={{ flex: 1 }}>أوافق على ظهور صوره (والبث لاحقاً)</T>
                    <Switch value={ch.mediaConsent} trackColor={{ true: c.primary }} onValueChange={(v) => void run(() => api(`/me/children/${ch.id}/consent`, { method: 'PATCH', body: { mediaConsent: v } }), v ? 'سُجلت موافقتك.' : 'سُحبت الموافقة.')} />
                  </View>
                  {join?.id === ch.id ? (
                    <>
                      <Field label="رمز الانضمام من مدير الفريق" value={join.code} onChangeText={(v) => setJoin({ id: ch.id, code: v.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() })} autoCapitalize="characters" />
                      <Button title="ضمّه للفريق" small onPress={() => run(() => api(`/me/children/${ch.id}/teams`, { method: 'POST', body: { code: join.code } }), 'انضم ابنك للفريق.').then(() => setJoin(null))} disabled={join.code.length !== 6} />
                    </>
                  ) : <Button title="ضمّه لفريق برمز" kind="light" small onPress={() => setJoin({ id: ch.id, code: '' })} />}
                </Card>
              )) : <Empty icon="child">لم تضف أبناء بعد.</Empty>}
              <Card style={{ padding: 16, gap: 12 }}>
                <T v="h3">أضف ابناً دون 18 سنة</T>
                <Field label="الاسم الأول" value={f.firstName} onChangeText={(v) => setF({ ...f, firstName: v })} maxLength={30} hint="يظهر للعامة بالاسم الأول فقط." />
                <Field label="سنة الميلاد" value={f.birthYear} onChangeText={(v) => setF({ ...f, birthYear: v.replace(/[^0-9]/g, '').slice(0, 4) })} keyboardType="number-pad" />
                <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}>
                  <T v="small" style={{ flex: 1 }}>أوافق على ظهور صوره</T>
                  <Switch value={f.consent} trackColor={{ true: c.primary }} onValueChange={(v) => setF({ ...f, consent: v })} />
                </View>
                <Button title="أضف" icon="plus" small disabled={f.firstName.trim().length < 2 || f.birthYear.length !== 4}
                  onPress={() => run(() => api('/me/guardian/children', { method: 'POST', body: { firstName: f.firstName.trim(), birthYear: Number(f.birthYear), mediaConsent: f.consent } }), 'أُضيف ابنك.').then(() => setF({ firstName: '', birthYear: '', consent: false }))} />
              </Card>
            </Section>
          </>
        )}
      </ScrollPage>
    </View>
  );
}

export function NotificationsScreen() {
  const { c } = useTheme();
  const { openPath } = useNav();
  const { reloadUnread } = useAuth();
  const list = useLoad(() => api<{ unread: number; items: Notification[] }>('/me/notifications?limit=50'));
  const open = async (n: Notification) => {
    if (!n.readAt) { await api(`/me/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined); void reloadUnread(); void list.reload(); }
    const path = pathFromData(n.data);
    if (path && path !== '/notifications') openPath(path);
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="الإشعارات" right={list.data?.unread ? (
        <Pressable onPress={async () => { await api('/me/notifications/read-all', { method: 'POST' }); void reloadUnread(); void list.reload(); }} hitSlop={8} accessibilityRole="button">
          <T v="smallB" color={c.primary}>اقرأ الكل</T>
        </Pressable>
      ) : undefined} />
      <ScrollPage onRefresh={list.refresh} refreshing={list.refreshing}>
        <View style={{ padding: 16, gap: 10 }}>
          {list.loading && !list.data ? <Loading /> : list.error ? <ErrorBox message={list.error} onRetry={list.refresh} /> : list.data?.items.length ? list.data.items.map((n) => (
            <Card key={n.id} onPress={() => void open(n)} style={{ padding: 14, gap: 6, borderColor: n.readAt ? c.border : c.primary }}>
              <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
                {!n.readAt && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary }} />}
                <T v="bodyB" style={{ flex: 1 }}>{n.titleAr}</T>
                <T v="tiny" muted>{relativeTime(n.createdAt)}</T>
              </View>
              <T v="small" muted>{n.bodyAr}</T>
            </Card>
          )) : <Empty icon="bell">لا إشعارات بعد. يصلك هنا كل ما يخص مبارياتك وفريقك.</Empty>}
        </View>
      </ScrollPage>
    </View>
  );
}

/** البحث في البطولات (بالاسم والمدينة والنوع) */
export function SearchScreen() {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const list = useLoad(() => api<TournamentSummary[]>('/tournaments'));
  const found = useMemo(() => {
    const s = q.trim();
    if (!s) return [];
    return (list.data ?? []).filter((t) => t.status !== 'draft' && [t.nameAr, t.city ?? '', TOURNAMENT_KIND_LABELS[t.kind], t.community?.nameAr ?? ''].some((x) => x.includes(s)));
  }, [q, list.data]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="بحث" />
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <Field label="ابحث عن بطولة" value={q} onChangeText={setQ} autoFocus placeholder="اسم البطولة أو المدينة أو المجموعة" returnKeyType="search" />
      </View>
      <ScrollPage>
        <View style={{ padding: 16, gap: 12 }}>
          {list.loading ? <Loading /> : q.trim() && !found.length ? <Empty icon="search">لا نتائج.</Empty> : found.map((t) => <TourCard key={t.id} t={t} />)}
          {!q.trim() && <View style={{ alignItems: 'center', paddingTop: 24 }}><Icon name="search" size={40} color={c.muted} /></View>}
        </View>
      </ScrollPage>
    </View>
  );
}
