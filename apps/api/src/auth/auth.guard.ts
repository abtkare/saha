import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { hasPermission, type Permission, type PermissionScope } from '@saha/shared';
import { AppError } from '../common/arabic-error.filter';
import { AuthService } from './auth.service';
import type { AuthContext, AuthedRequest } from './auth.types';

/** يفرض رمز دخول صالحاً ويضع سياق المستخدم في req.auth */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    req.auth = await this.auth.authenticate(req.headers.authorization);
    return true;
  }
}

/** يرمي 403 إن لم تمنح أدوار المستخدم الصلاحية في النطاق المطلوب (المصفوفة في @saha/shared). */
export function assertCan(auth: AuthContext, permission: Permission, scope: PermissionScope = {}) {
  if (!hasPermission(auth.grants, permission, scope, auth.mfa)) {
    throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الإجراء.');
  }
}

/** حساب فعّال (ليس قاصراً بانتظار موافقة ولي أمره) */
export function assertActive(auth: AuthContext) {
  if (auth.status !== 'active') throw new AppError(403, 'PENDING_GUARDIAN', 'حسابك بانتظار موافقة ولي أمرك.');
}
