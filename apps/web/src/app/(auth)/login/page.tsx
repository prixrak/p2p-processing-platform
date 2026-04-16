'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Shield, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';
import { UserRole } from '@p2p/shared';
import { getDashboardPathForRole } from '@/lib/role-dashboard';

export default function LoginPage() {
  const router = useRouter();
  const { login, verify2FA, requires2FA, isAuthenticated, user, loadUser, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code2FA, setCode2FA] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (isLoading) return;
    if (!requires2FA && isAuthenticated && user) {
      router.replace(getDashboardPathForRole(user.role));
    }
  }, [isLoading, requires2FA, isAuthenticated, user, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (!result.requires2FA) {
        const currentUser = useAuth.getState().user;
        router.replace(getDashboardPathForRole(currentUser?.role ?? UserRole.TRADER));
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Connection error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handle2FA(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verify2FA(code2FA);
      const currentUser = useAuth.getState().user;
      router.replace(getDashboardPathForRole(currentUser?.role ?? UserRole.TRADER));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Invalid verification code.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (isLoading || (!requires2FA && isAuthenticated && user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-blue/30 border-t-accent-blue" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-accent-blue/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-accent-blue/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-blue/10">
            <Zap className="h-7 w-7 text-accent-blue" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">P2P Processing</h1>
          <p className="mt-1 text-sm text-text-muted">Sign in to your account</p>
        </div>

        <Card>
          {!requires2FA ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <Input
                label="Password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />

              {error && (
                <div className="rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                  {error}
                </div>
              )}

              <Button type="submit" loading={loading} className="w-full">
                Sign In
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <form onSubmit={handle2FA} className="space-y-5">
              <div className="flex items-center gap-3 rounded-lg bg-accent-blue/10 px-4 py-3">
                <Shield className="h-5 w-5 shrink-0 text-accent-blue" />
                <p className="text-sm text-text-secondary">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>

              <Input
                label="Verification Code"
                type="text"
                placeholder="000000"
                value={code2FA}
                onChange={(e) => setCode2FA(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoComplete="one-time-code"
                maxLength={6}
                className="text-center text-lg tracking-[0.5em] font-mono"
              />

              {error && (
                <div className="rounded-lg bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                  {error}
                </div>
              )}

              <Button type="submit" loading={loading} className="w-full">
                Verify
                <Shield className="h-4 w-4" />
              </Button>

              <button
                type="button"
                onClick={() => {
                  useAuth.setState({ requires2FA: false, tempToken: null });
                  setCode2FA('');
                  setError('');
                }}
                className="w-full text-center text-sm text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
              >
                Back to login
              </button>
            </form>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-text-muted">
          Secure P2P Processing Platform &middot; All rights reserved
        </p>
      </div>
    </div>
  );
}
