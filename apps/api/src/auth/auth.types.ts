import type { Request } from 'express';
import type { RoleGrant } from '@saha/shared';

export interface AuthContext {
  userId: number;
  sessionId: number | null;
  mfa: boolean;
  status: 'active' | 'pending_guardian' | 'suspended' | 'deleted';
  grants: RoleGrant[];
}

export type AuthedRequest = Request & { auth: AuthContext; setupUserId?: number };

export const clientIp = (req: Request) => (req.ip ?? '').replace(/^::ffff:/, '') || 'unknown';
