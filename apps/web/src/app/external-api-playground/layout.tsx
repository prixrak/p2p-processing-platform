import '@/features/external-api-playground/external-api-playground.css';

export default function ExternalApiPlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="external-api-playground-root">{children}</div>;
}
