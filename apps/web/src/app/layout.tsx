import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { NavigationProgress } from '@/components/navigation-progress';
import { ThemeProvider } from '@/components/theme-provider';
import { QueryProvider } from '@/lib/query-provider';
import enMessages from '../../messages/en.json';
import './globals.css';

export const metadata: Metadata = {
  title: 'P2P Processing Platform',
  description: 'P2P payment processing platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-surface-primary text-text-primary antialiased">
        <ThemeProvider>
          <NextIntlClientProvider locale="en" messages={enMessages}>
            <QueryProvider>
              <NavigationProgress />
              {children}
            </QueryProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
