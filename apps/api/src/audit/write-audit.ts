import { Prisma, PrismaClient } from '@prisma/client';

/** بلا اعتماد على NestJS حتى يستخدمه سكربت البيانات الأولية أيضاً. */
export interface AuditEntry {
  actorUserId?: number | null;
  action: string; // مثال: tournament.create
  entity: string; // مثال: tournament
  entityId?: string | number | null;
  payload?: Prisma.InputJsonValue;
  ip?: string | null;
}

export type Db = PrismaClient | Prisma.TransactionClient;

export function writeAudit(db: Db, entry: AuditEntry) {
  return db.auditLog.create({
    data: {
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId == null ? null : String(entry.entityId),
      payload: entry.payload ?? {},
      ip: entry.ip ?? null,
    },
  });
}
