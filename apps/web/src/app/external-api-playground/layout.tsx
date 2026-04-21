import { notFound } from 'next/navigation';
import '@/features/external-api-playground/external-api-playground.css';

export default function ExternalApiPlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.EXTERNAL_PLAYGROUND_ENABLED !== 'true') {
    notFound();
  }

  return <div className="external-api-playground-root">{children}</div>;
}
