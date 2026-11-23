/**
 * مخزن مؤقت (رموز OTP وعدّادات Rate Limit).
 * Redis في التشغيل الفعلي (REDIS_URL)، وذاكرة داخلية في الاختبارات أو إن لم يُضبط REDIS_URL.
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export interface KvBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
  /** يزيد العدّاد ويضبط المهلة عند أول زيادة؛ يُرجع القيمة الجديدة والثواني المتبقية */
  incr(key: string, ttlSec: number): Promise<{ count: number; ttl: number }>;
  close(): Promise<void>;
}

class MemoryKv implements KvBackend {
  private map = new Map<string, { v: string; exp: number }>();
  private live(key: string) {
    const e = this.map.get(key);
    if (e && e.exp <= Date.now()) { this.map.delete(key); return undefined; }
    return e;
  }
  async get(key: string) { return this.live(key)?.v ?? null; }
  async set(key: string, value: string, ttlSec: number) { this.map.set(key, { v: value, exp: Date.now() + ttlSec * 1000 }); }
  async del(key: string) { this.map.delete(key); }
  async incr(key: string, ttlSec: number) {
    const e = this.live(key);
    const next = { v: String(Number(e?.v ?? 0) + 1), exp: e?.exp ?? Date.now() + ttlSec * 1000 };
    this.map.set(key, next);
    return { count: Number(next.v), ttl: Math.ceil((next.exp - Date.now()) / 1000) };
  }
  async close() { this.map.clear(); }
}

class RedisKv implements KvBackend {
  constructor(private readonly r: Redis) {}
  get(key: string) { return this.r.get(key); }
  async set(key: string, value: string, ttlSec: number) { await this.r.set(key, value, 'EX', ttlSec); }
  async del(key: string) { await this.r.del(key); }
  async incr(key: string, ttlSec: number) {
    const res = await this.r.multi().incr(key).expire(key, ttlSec, 'NX').ttl(key).exec();
    return { count: Number(res?.[0]?.[1] ?? 1), ttl: Number(res?.[2]?.[1] ?? ttlSec) };
  }
  async close() { await this.r.quit(); }
}

@Injectable()
export class KvService implements KvBackend, OnModuleDestroy {
  private readonly b: KvBackend;
  constructor() {
    const url = process.env.REDIS_URL;
    this.b = url ? new RedisKv(new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false })) : new MemoryKv();
    if (!url) console.warn('REDIS_URL غير مضبوط — يُستخدم مخزن مؤقت في الذاكرة (للتطوير والاختبار فقط).');
  }
  get(k: string) { return this.b.get(`saha:${k}`); }
  set(k: string, v: string, ttl: number) { return this.b.set(`saha:${k}`, v, ttl); }
  del(k: string) { return this.b.del(`saha:${k}`); }
  incr(k: string, ttl: number) { return this.b.incr(`saha:${k}`, ttl); }
  close() { return this.b.close(); }
  onModuleDestroy() { return this.close(); }
}
