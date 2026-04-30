import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@p2p/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';

function normalizeGuardRole(role: unknown): string {
  if (role === null || role === undefined) return '';
  const s = typeof role === 'string' ? role : String(role);
  return s.trim();
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const normalizedUserRole = normalizeGuardRole(user?.role);
    const allowed = new Set(
      requiredRoles.map((r) => normalizeGuardRole(r)).filter(Boolean),
    );

    if (!normalizedUserRole || !allowed.has(normalizedUserRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
