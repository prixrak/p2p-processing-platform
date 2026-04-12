'use client';

import { Settings, User, Lock, Bell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-accent-blue" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
          <p className="text-sm text-text-muted">Manage your account preferences</p>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <User className="h-5 w-5 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">Profile</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-text-muted">Name</span>
            <p className="text-sm text-text-primary">{user?.name ?? '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Email</span>
            <p className="text-sm text-text-primary">{user?.email ?? '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Role</span>
            <p className="text-sm text-text-primary">{user?.role ?? '-'}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <Lock className="h-5 w-5 text-text-muted" />
          <h2 className="text-lg font-semibold text-text-primary">Security</h2>
        </div>
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border-secondary">
          <p className="text-sm text-text-muted">Password change & 2FA management coming soon</p>
        </div>
      </Card>
    </div>
  );
}
