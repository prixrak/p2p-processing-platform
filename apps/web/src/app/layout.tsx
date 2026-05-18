import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { NavigationProgress } from '@/components/navigation-progress';
import { QueryProvider } from '@/lib/query-provider';
import enMessages from '../../messages/en.json';
import './globals.css';

export const metadata: Metadata = {
  title: 'P2P Processing Platform',
  description: 'P2P payment processing platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0a0f] text-gray-100 antialiased">
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <QueryProvider>
            <NavigationProgress />
            {children}
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
