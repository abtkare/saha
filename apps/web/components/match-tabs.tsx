'use client';
import { useState } from 'react';
import type { MatchItem } from '@/lib/api';
import { EmptyCard, MatchCard } from './cards';

const LABELS = ['أمس', 'اليوم', 'غداً'];

/** قسم المباريات بتبويبات أمس/اليوم/غداً — نفس سلوك app.js في المعاينة */
export function MatchTabs({ days, failed }: { days: MatchItem[][]; failed: boolean }) {
  const [day, setDay] = useState(1);
  return (
    <section id="matches" className="wrap sec">
      <div className="between wrapflex">
        <h2>المباريات</h2>
        <div className="tabs" role="tablist" aria-label="اختر اليوم">
          {LABELS.map((l, i) => (
            <button key={l} role="tab" aria-selected={day === i} onClick={() => setDay(i)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="grid g320">
        {failed ? <EmptyCard>تعذّر تحميل المباريات الآن. حاول بعد قليل.</EmptyCard>
          : days[day].length === 0 ? <EmptyCard>لا توجد مباريات في هذا اليوم.</EmptyCard>
          : days[day].map((m) => <MatchCard key={m.id} m={m} />)}
      </div>
    </section>
  );
}
