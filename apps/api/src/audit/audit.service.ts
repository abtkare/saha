import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditEntry, Db, writeAudit } from './write-audit';

export type { AuditEntry } from './write-audit';


/** كتابة سجل التدقيق والتحقق منه. التسلسل والبصمة يحسبهما الـ Trigger في القاعدة. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(entry: AuditEntry, db: Db = this.prisma) {
    return writeAudit(db, entry);
  }

  async verify() {
    const rows = await this.prisma.$queryRaw<
      { ok: boolean; checked: bigint; broken_seq: bigint | null; reason: string | null }[]
    >`SELECT * FROM audit_verify()`;
    const r = rows[0];
    return { ok: r.ok, checked: Number(r.checked), brokenSeq: r.broken_seq === null ? null : Number(r.broken_seq), reason: r.reason };
  }
}

