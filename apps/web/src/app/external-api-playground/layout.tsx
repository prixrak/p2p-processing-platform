import { notFound } from 'next/navigation';
import '@/features/external-api-playground/external-api-playground.css';

export const dynamic = 'force-dynamic';

/** Opt-out: block only when explicitly disabled. Missing/unset env must not 404 (Docker/standalone often omits vars). */
function playgroundBlocked(): boolean {
  const v = process.env.EXTERNAL_PLAYGROUND_ENABLED?.trim().toLowerCase();
  return v === 'false' || v === '0' || v === 'no' || v === 'off';
}

export default function ExternalApiPlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (playgroundBlocked()) {
    notFound();
  }

  return <div className="external-api-playground-root">{children}</div>;
}
