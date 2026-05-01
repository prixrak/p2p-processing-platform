import type { Metadata } from 'next';
import { PaymentClient } from './payment-client';
import { fetchOrder } from '@/lib/api';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Payment ${id.slice(0, 8)}… — P2P Processing`,
    description: 'Complete your payment securely',
    robots: { index: false, follow: false },
  };
}

export default async function PaymentPage({ params }: PageProps) {
  const { id } = await params;

  let order;
  let error: string | null = null;

  try {
    order = await fetchOrder(id);
  } catch {
    error = 'We could not open this payment. Check the link or contact the merchant for a new one.';
  }

  return (
    <main className="flex min-h-dvh items-start justify-center bg-surface-primary px-4 py-8 sm:py-16">
      <div className="w-full max-w-md animate-fade-in">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-accent">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-text-primary">
            Payment
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Transfer the exact amount to the details below
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger-muted px-6 py-10 text-center">
            <p className="text-sm font-medium text-danger">{error}</p>
            <p className="mt-2 text-xs text-text-muted">
              Check your link or contact the merchant for a new one.
            </p>
          </div>
        ) : order ? (
          <PaymentClient order={order} />
        ) : null}

        <p className="mt-8 text-center text-xs text-text-muted">
          Secure payment processing · Do not share this link
        </p>
      </div>
    </main>
  );
}
