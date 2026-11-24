/** الأخبار: القائمة والتفاصيل، والصفحات الثابتة (الشروط، الخصوصية، اتصل بنا) */
import { Image, View, useWindowDimensions } from 'react-native';
import { api } from '../api';
import { absolute, NewsRow } from '../components/cards';
import { Mark } from '../components/icons';
import { TabHeader, TopBar } from '../components/layout';
import { Empty, ErrorBox, Loading, ScrollPage } from '../components/ui';
import { relativeTime } from '../format';
import { useLoad } from '../hooks';
import { radius, T, useTheme } from '../theme';
import type { NewsItem, Post } from '../types';

export function NewsScreen() {
  const { c } = useTheme();
  const list = useLoad(() => api<NewsItem[]>('/news?limit=30'));
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title="الأخبار" subtitle="أخبار البطولات والفرق" />
      <ScrollPage onRefresh={list.refresh} refreshing={list.refreshing}>
        <View style={{ padding: 16, gap: 12 }}>
          {list.loading && !list.data ? <Loading /> : list.error ? <ErrorBox message={list.error} onRetry={list.refresh} /> :
            list.data?.length ? list.data.map((n) => <NewsRow key={n.id} n={n} />) : <Empty icon="news">لا أخبار بعد.</Empty>}
        </View>
      </ScrollPage>
    </View>
  );
}

/** نص المنشور: فقرات مفصولة بسطر فارغ، والسطر الذي يبدأ بـ ## عنوان */
function Body({ text }: { text: string }) {
  return (
    <View style={{ gap: 12 }}>
      {text.split(/\n{2,}/).map((p, i) => {
        const t = p.trim();
        if (!t) return null;
        if (t.startsWith('#')) return <T key={i} v="h2">{t.replace(/^#+\s*/, '')}</T>;
        return <T key={i} v="body" size={16} style={{ lineHeight: 28 }}>{t.replace(/[*_`]/g, '')}</T>;
      })}
    </View>
  );
}

export function PostScreen({ slug }: { slug: string }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const p = useLoad(() => api<Post>(`/news/${encodeURIComponent(slug)}`), [slug]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title="خبر" />
      <ScrollPage onRefresh={p.refresh} refreshing={p.refreshing}>
        {p.loading && !p.data ? <Loading /> : !p.data ? <View style={{ padding: 16 }}><ErrorBox message={p.error ?? 'الخبر غير موجود.'} onRetry={p.refresh} /></View> : (
          <View style={{ padding: 16, gap: 14 }}>
            <View style={{ height: (width - 32) * 0.5, borderRadius: radius.md, backgroundColor: c.thumb, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {p.data.coverUrl ? <Image source={{ uri: absolute(p.data.coverUrl) }} style={{ width: '100%', height: '100%' }} /> : <Mark size={72} color={c.primary} />}
            </View>
            <T v="h1" size={24}>{p.data.titleAr}</T>
            <T v="small" muted>{relativeTime(p.data.publishedAt)}</T>
            <Body text={p.data.bodyAr} />
          </View>
        )}
      </ScrollPage>
    </View>
  );
}

const TITLES = { terms: 'الشروط والأحكام', privacy: 'سياسة الخصوصية', contact: 'اتصل بنا' } as const;

export function StaticPageScreen({ slug }: { slug: keyof typeof TITLES }) {
  const { c } = useTheme();
  const p = useLoad(() => api<Post>(`/pages/${slug}`), [slug]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title={TITLES[slug]} />
      <ScrollPage onRefresh={p.refresh} refreshing={p.refreshing}>
        <View style={{ padding: 16, gap: 14 }}>
          {p.loading && !p.data ? <Loading /> : p.data ? (
            <>
              <T v="h1" size={24}>{p.data.titleAr}</T>
              <Body text={p.data.bodyAr} />
            </>
          ) : <Empty>هذه الصفحة لم تُنشر بعد.</Empty>}
        </View>
      </ScrollPage>
    </View>
  );
}
