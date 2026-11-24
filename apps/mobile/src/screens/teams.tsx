/** الفريق (عام)، و«فريقي»: نتائج تنتظر تأكيدي، مباريات أحكمها، فرقي وإدارتها، إنشاء فريق والانضمام برمز */
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { TOURNAMENT_KIND_LABELS, TOURNAMENT_STATUS_LABELS } from '@saha/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { MatchCard } from '../components/cards';
import { Icon } from '../components/icons';
import { HeroBlock, TabHeader, TopBar } from '../components/layout';
import { Button, Card, Chip, Crest, Divider, Empty, ErrorBox, Field, ListRow, Loading, Notice, ScrollPage, Section } from '../components/ui';
import { dateTime } from '../format';
import { errMsg, useLoad } from '../hooks';
import { useNav } from '../nav';
import { row, T, useTheme } from '../theme';
import type { MyMatch, TeamDetail, TournamentSummary, Verification } from '../types';

export function TeamScreen({ id }: { id: number }) {
  const { c } = useTheme();
  const { push } = useNav();
  const page = useLoad(() => api<TeamDetail>(`/teams/${id}`), [id]);
  const t = page.data;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar hero title={t?.nameAr ?? 'الفريق'} />
      <ScrollPage onRefresh={page.refresh} refreshing={page.refreshing}>
        {page.loading && !t ? <Loading /> : !t ? <View style={{ padding: 16 }}><ErrorBox message={page.error ?? 'الفريق غير موجود.'} onRetry={page.refresh} /></View> : (
          <>
            <HeroBlock>
              <View style={{ flexDirection: row, alignItems: 'center', gap: 14 }}>
                <Crest name={t.nameAr} size={64} onHero />
                <View style={{ flex: 1, gap: 6 }}>
                  <T v="h1" color="#FFFFFF">{t.nameAr}</T>
                  <View style={{ flexDirection: row, gap: 8, flexWrap: 'wrap' }}>
                    {t.verified && <Chip tone="gold">موثّق</Chip>}
                    {t.city ? <Chip tone="glass">{t.city}</Chip> : null}
                    {t.community ? <Chip tone="glass">{t.community.nameAr}</Chip> : null}
                  </View>
                </View>
              </View>
            </HeroBlock>
            <Section title="اللاعبون">
              {t.players.length ? (
                <Card flush>
                  {t.players.map((p, i) => (
                    <View key={p.id}>
                      {i > 0 && <Divider />}
                      <View style={{ flexDirection: row, alignItems: 'center', gap: 12, padding: 14 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}>
                          <T v="num" size={14} color={c.primary}>{p.shirtNo ?? '—'}</T>
                        </View>
                        <T v="bodyB" style={{ flex: 1 }}>{p.name}</T>
                      </View>
                    </View>
                  ))}
                </Card>
              ) : <Empty icon="team">لا لاعبين بعد.</Empty>}
            </Section>
            {t.tournaments.length > 0 && (
              <Section title="البطولات">
                <Card flush>
                  {t.tournaments.map((x, i) => (
                    <View key={x.id}>
                      {i > 0 && <Divider />}
                      <ListRow title={x.nameAr} subtitle={[TOURNAMENT_KIND_LABELS[x.kind], TOURNAMENT_STATUS_LABELS[x.status], x.groupLabel ? `المجموعة ${x.groupLabel}` : null].filter(Boolean).join(' · ')} icon="trophy" onPress={() => push({ name: 'tournament', slug: x.slug })} />
                    </View>
                  ))}
                </Card>
              </Section>
            )}
            <Section title="المباريات">
              {t.matches.length ? t.matches.map((m) => <MatchCard key={m.id} m={m} withDay showTournament />) : <Empty icon="clock">لا مباريات بعد.</Empty>}
            </Section>
          </>
        )}
      </ScrollPage>
    </View>
  );
}

/** دعوة لتسجيل الدخول داخل التبويبات التي تحتاج حساباً */
export function SignInCard({ text }: { text: string }) {
  const { push } = useNav();
  return (
    <Card style={{ padding: 20, gap: 14, alignItems: 'stretch' }}>
      <T v="h3" center>{text}</T>
      <T v="small" muted center>الدخول برقم هاتفك ورمز يصلك برسالة.</T>
      <Button title="سجّل الدخول" onPress={() => push({ name: 'login' })} />
    </Card>
  );
}

export function MyTeamsScreen() {
  const { c } = useTheme();
  const { push } = useNav();
  const { me, teams, reload: reloadMe } = useAuth();
  const page = useLoad(async () => (me ? api<{ refereeing: MyMatch[]; pendingConfirmation: MyMatch[] }>('/me/matches') : null), [me?.id, teams.length]);
  const d = page.data;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title="فريقي" subtitle="فرقك ومبارياتك ونتائج تنتظرك" />
      <ScrollPage onRefresh={() => { page.refresh(); void reloadMe(); }} refreshing={page.refreshing}>
        {!me ? <View style={{ padding: 16 }}><SignInCard text="سجّل الدخول لإدارة فريقك" /></View> : (
          <>
            {me.status === 'pending_guardian' && <View style={{ padding: 16, paddingBottom: 0 }}><Notice tone="warn">حسابك بانتظار موافقة ولي أمرك. اطلب منه الدخول برقمه والموافقة من «حسابي ← العائلة».</Notice></View>}
            {!!d?.pendingConfirmation.length && (
              <Section title="نتائج تنتظر تأكيدك">
                {d.pendingConfirmation.map((m) => (
                  <View key={m.id} style={{ gap: 6 }}>
                    <MatchCard m={m} showTournament />
                    {m.disputeDeadline && <T v="small" muted center>{`أكّد أو اعترض قبل ${dateTime(m.disputeDeadline)}`}</T>}
                  </View>
                ))}
              </Section>
            )}
            {!!d?.refereeing.length && (
              <Section title="مباريات أحكمها">
                {d.refereeing.map((m) => (
                  <View key={m.id} style={{ gap: 8 }}>
                    <MatchCard m={m} showTournament withDay />
                    <Button title={m.resultStatus === 'scheduled' ? 'أدخل النتيجة' : 'صحّح النتيجة'} kind="gold" icon="whistle" small onPress={() => push({ name: 'result', id: m.id })} />
                  </View>
                ))}
              </Section>
            )}
            <Section title="فرقي">
              {page.error && <ErrorBox message={page.error} onRetry={page.refresh} />}
              {teams.length ? (
                <Card flush>
                  {teams.map((t, i) => (
                    <View key={t.id}>
                      {i > 0 && <Divider />}
                      <ListRow title={t.nameAr} subtitle={[t.city, `${t._count.players} لاعب`, t.verifiedAt ? 'موثّق' : 'غير موثّق'].filter(Boolean).join(' · ')} icon="team" onPress={() => push({ name: 'teamManage', id: t.id })} />
                    </View>
                  ))}
                </Card>
              ) : <Empty icon="team">لا تدير فريقاً بعد. أنشئ فريقك أو انضم لفريق برمز من مديره.</Empty>}
              <View style={{ flexDirection: row, gap: 8 }}>
                <Button title="أنشئ فريقاً" icon="plus" style={{ flex: 1 }} onPress={() => push({ name: 'createTeam' })} />
                <Button title="انضم برمز" kind="secondary" style={{ flex: 1 }} onPress={() => push({ name: 'joinTeam' })} />
              </View>
            </Section>
          </>
        )}
      </ScrollPage>
    </View>
  );
}

export function CreateTeamScreen() {
  const { c } = useTheme();
  const { pop, push } = useNav();
  const { reload } = useAuth();
  const [f, setF] = useState({ nameAr: '', city: '', fbPageUrl: '' });
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      const t = await api<{ id: number }>('/teams', { method: 'POST', body: { nameAr: f.nameAr.trim(), ...(f.city.trim() ? { city: f.city.trim() } : {}), ...(f.fbPageUrl.trim() ? { fbPageUrl: f.fbPageUrl.trim() } : {}) } });
      await reload();
      pop();
      push({ name: 'teamManage', id: t.id });
    } catch (e) { setError(errMsg(e)); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="فريق جديد" />
      <ScrollPage>
        <View style={{ padding: 16, gap: 14 }}>
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="اسم الفريق" value={f.nameAr} onChangeText={(v) => setF({ ...f, nameAr: v })} maxLength={40} placeholder="مثال: شباب الكرادة" />
          <Field label="المدينة (اختياري)" value={f.city} onChangeText={(v) => setF({ ...f, city: v })} maxLength={40} placeholder="بغداد" />
          <Field label="رابط صفحة فيسبوك (اختياري)" value={f.fbPageUrl} onChangeText={(v) => setF({ ...f, fbPageUrl: v })} autoCapitalize="none" keyboardType="url" hint="لتوثيق الفريق لاحقاً بمنشور على الصفحة." />
          <Button title="أنشئ الفريق" icon="check" onPress={save} disabled={f.nameAr.trim().length < 2} />
        </View>
      </ScrollPage>
    </View>
  );
}

export function JoinTeamScreen() {
  const { c } = useTheme();
  const { pop } = useNav();
  const { me } = useAuth();
  const [code, setCode] = useState('');
  const [shirt, setShirt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const join = async () => {
    setError(null);
    try {
      const r = await api<{ team: { nameAr: string } }>('/teams/join', { method: 'POST', body: { code: code.trim().toUpperCase(), ...(shirt ? { shirtNo: Number(shirt) } : {}) } });
      Alert.alert('انضممت للفريق', `أنت الآن لاعب في «${r.team.nameAr}».`);
      pop();
    } catch (e) { setError(errMsg(e)); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="الانضمام لفريق" />
      <ScrollPage>
        <View style={{ padding: 16, gap: 14 }}>
          <Notice>اطلب رمز الانضمام (6 أحرف) من مدير الفريق.{me?.birthYear && new Date().getFullYear() - me.birthYear < 18 ? ' أنت دون 18 سنة: ولي أمرك يضمك من حسابه.' : ''}</Notice>
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="رمز الانضمام" value={code} onChangeText={(v) => setCode(v.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase())} autoCapitalize="characters" style={{ letterSpacing: 4, fontSize: 20 }} />
          <Field label="رقم القميص (اختياري)" value={shirt} onChangeText={(v) => setShirt(v.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" />
          <Button title="انضم" icon="check" onPress={join} disabled={code.length !== 6} />
        </View>
      </ScrollPage>
    </View>
  );
}

/** إدارة فريقي: رمز الانضمام، اللاعبون، التوثيق، التسجيل في البطولات */
export function TeamManageScreen({ id }: { id: number }) {
  const { c } = useTheme();
  const { push } = useNav();
  const { teams, reload: reloadMe } = useAuth();
  const mine = teams.find((t) => t.id === id);
  const page = useLoad(async () => {
    const [players, verification, team, open] = await Promise.all([
      api<{ shirtNo: number | null; player: { id: number; firstName: string; lastName: string | null; birthYear: number } }[]>(`/teams/${id}/players`),
      api<Verification | null>(`/teams/${id}/verification`).catch(() => null),
      api<TeamDetail>(`/teams/${id}`),
      api<TournamentSummary[]>('/tournaments').then((l) => l.filter((t) => t.status === 'registration')),
    ]);
    return { players, verification, team, open };
  }, [id]);
  const d = page.data;
  const [phone, setPhone] = useState('');
  const [postUrl, setPostUrl] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'ok', text: ok }); await page.reload(); void reloadMe(); } catch (e) { setMsg({ tone: 'error', text: errMsg(e) }); }
  };
  const joinCode = mine?.joinCode;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title={mine?.nameAr ?? d?.team.nameAr ?? 'فريقي'} right={<Icon name="team" size={22} color={c.primary} />} />
      <ScrollPage onRefresh={page.refresh} refreshing={page.refreshing}>
        {page.loading && !d ? <Loading /> : !d ? <View style={{ padding: 16 }}><ErrorBox message={page.error ?? ''} onRetry={page.refresh} /></View> : (
          <>
            {msg && <View style={{ padding: 16, paddingBottom: 0 }}><Notice tone={msg.tone}>{msg.text}</Notice></View>}
            <Section title="رمز الانضمام">
              <Card style={{ padding: 16, gap: 12, alignItems: 'center' }}>
                <T v="num" size={34} style={{ letterSpacing: 6 }} center selectable>{joinCode ?? '——'}</T>
                <T v="small" muted center>شاركه مع لاعبيك البالغين، أو مع أولياء أمور اللاعبين دون 18.</T>
                <View style={{ flexDirection: row, gap: 8, alignSelf: 'stretch' }}>
                  <Button title="شارك" icon="share" small style={{ flex: 1 }} onPress={() => { if (joinCode) void Share.share({ message: `انضم لفريق «${mine?.nameAr}» في تطبيق ساحة برمز: ${joinCode}` }); }} />
                  <Button title="رمز جديد" kind="secondary" small style={{ flex: 1 }} onPress={() => Alert.alert('رمز جديد؟', 'الرمز القديم يتوقف عن العمل.', [{ text: 'إلغاء', style: 'cancel' }, { text: 'غيّره', onPress: () => void run(() => api(`/teams/${id}/join-code`, { method: 'POST' }), 'صدر رمز جديد.') }])} />
                </View>
              </Card>
            </Section>

            <Section title={`اللاعبون (${d.players.length})`}>
              {d.players.length ? (
                <Card flush>
                  {d.players.map((p, i) => (
                    <View key={p.player.id}>
                      {i > 0 && <Divider />}
                      <ListRow title={[p.player.firstName, p.player.lastName].filter(Boolean).join(' ')} subtitle={`${p.shirtNo ? `القميص ${p.shirtNo} · ` : ''}مواليد ${p.player.birthYear}`}
                        right={<Icon name="trash" size={20} color={c.danger} />}
                        onPress={() => Alert.alert('إخراج اللاعب من الفريق؟', p.player.firstName, [{ text: 'إلغاء', style: 'cancel' }, { text: 'أخرجه', style: 'destructive', onPress: () => void run(() => api(`/teams/${id}/players/${p.player.id}`, { method: 'DELETE' }), 'أُخرج اللاعب.') }])} />
                    </View>
                  ))}
                </Card>
              ) : <Empty icon="team">لا لاعبين بعد.</Empty>}
              <Card style={{ padding: 16, gap: 12 }}>
                <Field label="أضف لاعباً بالغاً برقم هاتفه" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07xxxxxxxxx" hint="يجب أن يكون اللاعب مسجلاً في التطبيق." />
                <Button title="أضف" icon="plus" small onPress={() => run(() => api(`/teams/${id}/players`, { method: 'POST', body: { phone } }), 'أُضيف اللاعب.').then(() => setPhone(''))} disabled={phone.length < 10} />
              </Card>
            </Section>

            <Section title="توثيق صفحة الفريق">
              <Card style={{ padding: 16, gap: 12 }}>
                {mine?.verifiedAt ? <Notice tone="ok">فريقك موثّق ✓</Notice> : !mine?.fbPageUrl ? (
                  <T v="small" muted>أضف رابط صفحة فيسبوك الفريق أولاً (من الموقع أو بإعادة إنشاء الفريق) ثم اطلب التوثيق.</T>
                ) : d.verification && d.verification.status === 'pending' ? (
                  <>
                    <T>{`انشر منشوراً عاماً على صفحة الفريق فيه الرمز:`}</T>
                    <T v="num" size={26} center selectable>{d.verification.code}</T>
                    {d.verification.postUrl ? <Notice>وصل رابط المنشور، وتراجعه الإدارة.</Notice> : (
                      <>
                        <Field label="رابط المنشور" value={postUrl} onChangeText={setPostUrl} autoCapitalize="none" keyboardType="url" />
                        <Button title="أرسل الرابط" small onPress={() => run(() => api(`/teams/${id}/verification`, { method: 'PATCH', body: { postUrl } }), 'وصل الرابط.')} disabled={!postUrl} />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {d.verification?.status === 'rejected' && <Notice tone="error">{`لم يُقبل الطلب السابق${d.verification.note ? `: ${d.verification.note}` : '.'}`}</Notice>}
                    <Button title="اطلب التوثيق" icon="shield" small onPress={() => run(() => api(`/teams/${id}/verification`, { method: 'POST' }), 'صدر رمز التوثيق.')} />
                  </>
                )}
              </Card>
            </Section>

            <Section title="سجّل في بطولة">
              {d.open.length ? d.open.map((t) => {
                const already = d.team.tournaments.some((x) => x.id === t.id);
                return (
                  <Card key={t.id} style={{ padding: 14, gap: 10 }}>
                    <T v="h3">{t.nameAr}</T>
                    <T v="small" muted>{[TOURNAMENT_KIND_LABELS[t.kind], t.city, t.maxTeams ? `${t._count.registrations}/${t.maxTeams} فرق` : null].filter(Boolean).join(' · ')}</T>
                    {already ? <Chip>مقبول</Chip> : (
                      <View style={{ flexDirection: row, gap: 8 }}>
                        <Button title="سجّل فريقك" small style={{ flex: 1 }} onPress={() => run(() => api(`/tournaments/${t.id}/registrations`, { method: 'POST', body: { teamId: id } }), 'وصل طلب التسجيل، وتراجعه إدارة البطولة.')} />
                        <Button title="التفاصيل" kind="light" small onPress={() => push({ name: 'tournament', slug: t.slug })} />
                      </View>
                    )}
                  </Card>
                );
              }) : <Empty icon="trophy">لا بطولات مفتوحة للتسجيل الآن.</Empty>}
            </Section>
          </>
        )}
      </ScrollPage>
    </View>
  );
}
