import { Injectable } from '@nestjs/common';
import { AppError } from '../common/arabic-error.filter';
import { KvService } from './kv';

export interface Limit { key: string; max: number; windowSec: number }

/** Rate Limit بنافذة ثابتة على Redis. يرمي 429 برسالة عربية تذكر مدة الانتظار. */
@Injectable()
export class RateLimitService {
  constructor(private readonly kv: KvService) {}

  async consume(...limits: Limit[]) {
    for (const l of limits) {
      const { count, ttl } = await this.kv.incr(`rl:${l.key}`, l.windowSec);
      if (count > l.max) {
        const mins = Math.max(1, Math.ceil(ttl / 60));
        throw new AppError(429, 'TOO_MANY_REQUESTS', `محاولات كثيرة. أعد المحاولة بعد ${mins} دقيقة.`);
      }
    }
  }

  reset(key: string) { return this.kv.del(`rl:${key}`); }
}
