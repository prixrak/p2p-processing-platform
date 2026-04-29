'use client';

import { CascadeDashboard } from '@/features/cascade/cascade-dashboard';

export default function SupportCascadePage() {
  return (
    <CascadeDashboard
      readOnly
      subtitle="Read-only coverage and cascade settings for monitoring (same API as Admin/Owner)."
    />
  );
}
