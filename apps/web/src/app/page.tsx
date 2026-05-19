'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getDashboardPathForRole } from '@/lib/role-dashboard';

export default function RootPage() {
  const router = useRouter();
  const { loadUser, isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && user) {
      router.replace(getDashboardPathForRole(user.role));
    } else {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-border-primary border-t-text-primary"
        aria-hidden
      />
    </div>
  );
}
