import { notFound } from 'next/navigation';
import '@/features/external-api-playground/external-api-playground.css';

export const dynamic = 'force-dynamic';

function playgroundAllowed(): boolean {
  const v = process.env.EXTERNAL_PLAYGROUND_ENABLED?.trim().toLowerCase();
  return v === 'true' || v === '1';
}

export default function ExternalApiPlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!playgroundAllowed()) {
    notFound();
  }

  return <div className="external-api-playground-root">{children}</div>;
}
