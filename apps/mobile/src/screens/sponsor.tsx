/** طلب رعاية حدث (الجلسة 11): الراعي يختار بطولة أو مباراة ويرفع شريحته، ثم يتابع حالة طلباته */
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SPONSOR_REQUEST_DAYS, SPONSOR_REQUEST_STATUS_LABELS, type SponsorRequestStatus } from '@saha/shared';
import { api, uploadImage } from '../api';
import { useAuth } from '../auth';
import { TopBar } from '../components/layout';
import { Button, Card, Chip, Empty, ErrorBox, Field, Loading, Notice, ScrollPage, Section, Tabs } from '../components/ui';
import { WEB_URL } from '../config';
import { dateTime } from '../format';
import { errMsg, useLoad } from '../hooks';
import { useNav } from '../nav';
import { row, T, useTheme } from '../theme';
import { SignInCard } from './teams';

interface EventMatch { id: number; kickoffAt: string | null; homeTeam: { nameAr: string }; awayTeam: { nameAr: string } }
interface EventTour { id: number; nameAr: string; slug: string; status: string; matches: EventMatch[] }
interface SponsorRequest {
  id: number; orgName: string; titleAr: string; subtitleAr: string | null; days: number; status: SponsorRequestStatus; reviewNote: string | null; createdAt: string;
  tournament: { id: number; nameAr: string; slug: string };
  match: { id: number; kickoffAt: string | null; homeTeam: { nameAr: string }; awayTeam: { nameAr: string } } | null;
  sponsor: { id: number; nameAr: string } | null;
  slide: { id: number; status: string; startsAt: string | null; endsAt: string | null } | null;
}

type Days = (typeof SPONSOR_REQUEST_DAYS)[number];
const tone = (s: SponsorRequestStatus) => (s === 'accepted' ? 'kind' : s === 'rejected' ? 'danger' : s === 'pending' ? 'gold' : 'info');

export function SponsorRequestScreen({ tournamentId, matchId }: { tournamentId?: number; matchId?: number }) {
  const { c } = useTheme();
  const { me } = useAuth();
  const { pop, push } = useNav();
  const events = useLoad(() => (me ? api<EventTour[]>('/sponsor-requests/events') : Promise.resolve([] as EventTour[])), [me?.id]);
  const [tid, setTid] = useState<number | null>(tournamentId ?? null);
  const [mid, setMid] = useState<number | null>(matchId ?? null);
  const [f, setF] = useState({ orgName: '', titleAr: '', subtitleAr: '', linkUrl: '', message: '' });
  const [days, setDays] = useState<Days>(14);
  const [img, setImg] = useState<{ uri: string; id: number | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <TopBar title="اطلب رعاية" />
        <View style={{ padding: 16 }}><SignInCard text="سجّل الدخول لتطلب رعاية بطولة أو مباراة" /></View>
      </View>
    );
  }

  const tour = events.data?.find((t) => t.id === tid) ?? null;

  const pick = async () => {
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setError('اسمح للتطبيق بالوصول إلى الصور من إعدادات الهاتف.'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [16, 9] });
      if (r.canceled || !r.assets?.[0]) return;
      const uri = r.assets[0].uri;
      setImg({ uri, id: null });
      setUploading(true);
      const up = await uploadImage(uri, 'private');
      setImg({ uri, id: up.id });
    } catch (e) {
      setImg(null);
      setError(errMsg(e));
    } finally {
      setUploading(false);
    }
  };

  const ready = !!tid && f.orgName.trim().length >= 2 && f.titleAr.trim().length >= 2 && !!img?.id && !uploading;
  const submit = async () => {
    setError(null);
    try {
      await api('/sponsor-requests', {
        method: 'POST',
        body: {
          orgName: f.orgName.trim(), titleAr: f.titleAr.trim(), subtitleAr: f.subtitleAr.trim() || null, linkUrl: f.linkUrl.trim() || null,
          message: f.message.trim() || null, days, imageMediaId: img!.id, ...(mid ? { matchId: mid } : { tournamentId: tid }),
        },
      });
      Alert.alert('وصل طلبك ✅', 'يراجعه فريق ساحة ويصلك إشعار بالقبول أو الرفض.');
      pop();
      push({ name: 'sponsorRequests' });
    } catch (e) { setError(errMsg(e)); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="اطلب رعاية" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollPage onRefresh={events.refresh} refreshing={events.refreshing}>
          <Section>
            <Notice>اختر الحدث وارفع صورة شريحتك. بعد قبول الطلب تظهر شريحتك في الشاشة الرئيسية للتطبيق والموقع طوال مدة العرض، وتتابع مرات الظهور والنقر من «بوابة الراعي».</Notice>
          </Section>

          <Section title="1. الحدث">
            {events.loading && !events.data ? <Loading /> : events.error ? <ErrorBox message={events.error} onRetry={events.refresh} /> : !events.data?.length ? (
              <Empty icon="trophy">لا بطولات متاحة للرعاية الآن.</Empty>
            ) : (
              <View style={{ gap: 8 }}>
                {events.data.map((t) => (
                  <Card key={t.id} onPress={() => { setTid(t.id); setMid(null); }} style={{ padding: 14, gap: 4, borderColor: tid === t.id ? c.primary : c.border, borderWidth: tid === t.id ? 2 : 1 }}>
                    <T v="bodyB">{t.nameAr}</T>
                    <T v="small" muted>{t.status === 'running' ? 'جارية' : 'التسجيل مفتوح'} · {t.matches.length ? `${t.matches.length} مباراة قادمة` : 'لا مباريات مجدولة بعد'}</T>
                  </Card>
                ))}
              </View>
            )}
          </Section>

          {tour && tour.matches.length > 0 && (
            <Section title="رعاية البطولة كلها أو مباراة واحدة">
              <View style={{ gap: 8 }}>
                <Card onPress={() => setMid(null)} style={{ padding: 12, borderColor: mid === null ? c.primary : c.border, borderWidth: mid === null ? 2 : 1 }}>
                  <T v="bodyB">البطولة كلها</T>
                </Card>
                {tour.matches.map((m) => (
                  <Card key={m.id} onPress={() => setMid(m.id)} style={{ padding: 12, gap: 2, borderColor: mid === m.id ? c.primary : c.border, borderWidth: mid === m.id ? 2 : 1 }}>
                    <T v="bodyB">{`${m.homeTeam.nameAr} × ${m.awayTeam.nameAr}`}</T>
                    {m.kickoffAt && <T v="small" muted>{dateTime(m.kickoffAt)}</T>}
                  </Card>
                ))}
              </View>
            </Section>
          )}

          <Section title="2. الشريحة">
            <Card style={{ padding: 16, gap: 12 }}>
              <Field label="اسم الجهة الراعية" value={f.orgName} onChangeText={(v) => setF({ ...f, orgName: v })} maxLength={80} placeholder="مثال: مطعم السلطان" />
              <Field label="عنوان الشريحة" value={f.titleAr} onChangeText={(v) => setF({ ...f, titleAr: v })} maxLength={80} placeholder="مثال: السلطان يرعى نهائي البطولة" />
              <Field label="نص قصير (اختياري)" value={f.subtitleAr} onChangeText={(v) => setF({ ...f, subtitleAr: v })} maxLength={140} placeholder="مثال: خصم 20% لجمهور ساحة" />
              <T v="smallB">صورة الشريحة (عرضية 16:9)</T>
              {img ? (
                <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel="غيّر الصورة">
                  <Image source={{ uri: img.uri }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: c.tint }} />
                  <T v="tiny" muted center style={{ marginTop: 4 }}>{uploading ? 'جارٍ رفع الصورة…' : img.id ? 'رُفعت ✓ — اضغط لتغييرها' : ''}</T>
                </Pressable>
              ) : <Button title="اختر صورة من الهاتف" icon="image" kind="light" onPress={pick} />}
              <Field label="رابط عند الضغط (اختياري)" value={f.linkUrl} onChangeText={(v) => setF({ ...f, linkUrl: v })} autoCapitalize="none" keyboardType="url" placeholder="https://…" hint="صفحتك أو حسابك. إن تركته فارغاً يفتح الحدث." style={{ textAlign: 'left' }} />
            </Card>
          </Section>

          <Section title="3. مدة العرض">
            <Tabs<string> items={SPONSOR_REQUEST_DAYS.map((d) => ({ key: String(d), label: `${d} يوماً` }))} value={String(days)} onChange={(k) => setDays(Number(k) as Days)} />
            <T v="tiny" muted style={{ marginTop: 6 }}>تبدأ المدة من لحظة قبول الطلب.</T>
          </Section>

          <Section title="ملاحظات لفريق ساحة (اختياري)">
            <Field label="ملاحظات" value={f.message} onChangeText={(v) => setF({ ...f, message: v })} maxLength={500} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
          </Section>

          <Section>
            {error && <Notice tone="error">{error}</Notice>}
            <Button title="أرسل طلب الرعاية" icon="check" onPress={submit} disabled={!ready} />
            {!ready && <T v="tiny" muted center style={{ marginTop: 6 }}>اختر الحدث واكتب اسم الجهة والعنوان وارفع الصورة.</T>}
          </Section>
        </ScrollPage>
      </KeyboardAvoidingView>
    </View>
  );
}

export function SponsorRequestsScreen() {
  const { c } = useTheme();
  const { me } = useAuth();
  const { push } = useNav();
  const list = useLoad(() => (me ? api<SponsorRequest[]>('/me/sponsor-requests') : Promise.resolve([] as SponsorRequest[])), [me?.id]);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const cancel = (r: SponsorRequest) => Alert.alert('إلغاء الطلب؟', r.titleAr, [
    { text: 'رجوع', style: 'cancel' },
    { text: 'ألغِ الطلب', style: 'destructive', onPress: async () => { try { await api(`/me/sponsor-requests/${r.id}/cancel`, { method: 'POST' }); setMsg({ tone: 'ok', text: 'أُلغي الطلب.' }); await list.reload(); } catch (e) { setMsg({ tone: 'error', text: errMsg(e) }); } } },
  ]);
  const accepted = list.data?.some((r) => r.status === 'accepted');
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="طلبات الرعاية" />
      <ScrollPage onRefresh={list.refresh} refreshing={list.refreshing}>
        {!me ? <View style={{ padding: 16 }}><SignInCard text="سجّل الدخول لمتابعة طلبات رعايتك" /></View> : (
          <Section>
            <View style={{ gap: 10 }}>
              {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
              <Button title="طلب رعاية جديد" icon="plus" onPress={() => push({ name: 'sponsorRequest' })} />
              {accepted && <Button title="بوابة الراعي: الظهور والنقرات" icon="link" kind="light" onPress={() => void Linking.openURL(`${WEB_URL}/sponsor/portal`)} />}
              {list.loading && !list.data ? <Loading /> : list.error ? <ErrorBox message={list.error} onRetry={list.refresh} /> : list.data?.length ? list.data.map((r) => (
                <Card key={r.id} style={{ padding: 14, gap: 6 }}>
                  <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
                    <T v="bodyB" style={{ flex: 1 }}>{r.titleAr}</T>
                    <Chip tone={tone(r.status)}>{SPONSOR_REQUEST_STATUS_LABELS[r.status]}</Chip>
                  </View>
                  <T v="small" muted>{`${r.orgName} · ${r.match ? `${r.match.homeTeam.nameAr} × ${r.match.awayTeam.nameAr}` : r.tournament.nameAr} · ${r.days} يوماً`}</T>
                  {r.status === 'rejected' && r.reviewNote && <Notice tone="error">{`السبب: ${r.reviewNote}`}</Notice>}
                  {r.status === 'accepted' && r.slide && (
                    <T v="small">{r.slide.status === 'published' ? `تظهر شريحتك حتى ${dateTime(r.slide.endsAt)}` : 'قُبل الطلب، وتظهر الشريحة بعد اعتمادها النهائي.'}</T>
                  )}
                  {r.status === 'pending' && <Button title="ألغِ الطلب" kind="light" small onPress={() => cancel(r)} />}
                </Card>
              )) : <Empty icon="trophy">لم تقدّم طلبات رعاية بعد.</Empty>}
            </View>
          </Section>
        )}
      </ScrollPage>
    </View>
  );
}
