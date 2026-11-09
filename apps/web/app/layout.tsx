import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { requestLocale } from '@/lib/locale';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ParkShield', template: '%s · ParkShield' },
  description: 'Ihre Handynummer gehört nicht hinter die Windschutzscheibe.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await requestLocale();
  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-bg text-fg antialiased">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
