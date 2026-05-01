"use client";

import type { StaffRolePrefix } from "@/features/traders";
import { Users } from "lucide-react";
import { StaffUserAccountsPanel } from "./staff-user-accounts-panel";

export interface StaffUsersPageProps {
  staffRole: StaffRolePrefix;
}

export function StaffUsersPage({ staffRole }: StaffUsersPageProps) {
  return (
    <div className='space-y-4 animate-fade-in'>
      <header className='flex flex-col gap-0.5 border-b border-border-subtle pb-3'>
        <h1 className='flex items-center gap-2 text-xl font-bold tracking-tight text-text-primary'>
          <Users className='h-5 w-5 shrink-0 opacity-90' aria-hidden />
          Users
        </h1>
        <p className='max-w-2xl text-xs leading-relaxed text-text-muted'>
          Search, filter, and manage users.
        </p>
      </header>

      <StaffUserAccountsPanel queryKeyPrefix={staffRole} />
    </div>
  );
}
