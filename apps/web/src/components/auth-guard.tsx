'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getDashboardPathForRole } from '@/lib/role-dashboard';

interface AuthGuardProps {
  children: React.ReactNode;
  /** Module-level constant array recommended to keep a stable reference. */
  allowedRoles: readonly string[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const router = useRouter();
  const { loadUser, isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      router.replace(getDashboardPathForRole(user.role));
    }
  }, [isLoading, isAuthenticated, user, router, allowedRoles]);

  if (isLoading || !isAuthenticated || !user) {
    return <FullScreenSpinner />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <FullScreenSpinner />;
  }

  return <>{children}</>;
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80"
        aria-hidden
      />
    </div>
  );
}
