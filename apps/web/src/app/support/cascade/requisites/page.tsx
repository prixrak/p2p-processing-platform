'use client';

import { CascadeRequisiteRatingsPanel } from '@/features/cascade/cascade-requisite-ratings-panel';

export default function SupportCascadeRequisitesPage() {
  return (
    <CascadeRequisiteRatingsPanel
      staffBase="support"
      subtitle="Read-only requisite ratings and cascade metrics (same data as Admin/Owner)."
    />
  );
}
