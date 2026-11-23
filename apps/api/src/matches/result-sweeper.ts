import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ResultsService } from './results';

/**
 * المهمة الخلفية لانتهاء نافذة الاعتراض: تفحص القاعدة كل RESULT_SWEEP_SECONDS (الافتراضي 60 ثانية)
 * وتجعل النتائج المنتهية مهلتها نهائية. الحالة في القاعدة نفسها، فلا يضيع شيء عند إعادة تشغيل الحاوية،
 * وتكرار الفحص آمن (التحديث مشروط بالحالة ووقت الإدخال). القيمة 0 توقفها.
 */
@Injectable()
export class ResultSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly results: ResultsService) {}

  onApplicationBootstrap() {
    const seconds = Number(process.env.RESULT_SWEEP_SECONDS ?? 60);
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref();
    setTimeout(() => void this.tick(), 2000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.results.sweep();
      if (n) console.log(`انتهت مهلة الاعتراض: ${n} نتيجة أصبحت نهائية`);
    } catch (e) {
      console.error('فشل فحص مهلة الاعتراض', e);
    } finally {
      this.running = false;
    }
  }
}
