'use client';

import { Container, LanguageSwitch, SkipLink, useI18n } from '@parkshield/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { hasSession } from '@/lib/api-client';
import { useBrowserValue } from '@/lib/use-browser-value';

export function SiteHeader() {
  const { t } = useI18n();
  const signedIn = useBrowserValue(hasSession, false);

  return (
    <header className="border-b border-border">
      <SkipLink>{t('common.skipToContent')}</SkipLink>
      <Container className="flex flex-wrap items-center justify-between gap-3 py-3">
        <Link href="/" className="inline-flex min-h-12 items-center text-xl font-bold">
          ParkShield<span className="sr-only"> – {t('nav.home')}</span>
        </Link>
        <nav aria-label={t('nav.main')} className="flex flex-wrap items-center gap-1 text-base">
          <Link className="rounded-lg px-3 py-3 hover:underline" href="/#so-funktionierts">
            {t('nav.how')}
          </Link>
          <Link className="rounded-lg px-3 py-3 hover:underline" href="/#preise">
            {t('nav.pricing')}
          </Link>
          <Link className="rounded-lg px-3 py-3 hover:underline" href="/business">
            {t('nav.business')}
          </Link>
          <Link
            className="rounded-lg px-3 py-3 font-semibold text-primary hover:underline"
            href={signedIn ? '/konto' : '/anmelden'}
          >
            {signedIn ? t('nav.account') : t('nav.login')}
          </Link>
        </nav>
        <LanguageSwitch />
      </Container>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  const links: [string, string][] = [
    ['/impressum', t('common.footer.impressum')],
    ['/datenschutz', t('common.footer.privacy')],
    ['/agb', t('common.footer.terms')],
    ['/widerruf', t('common.footer.withdrawal')],
    ['/barrierefreiheit', t('common.footer.accessibility')],
  ];
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <Container className="flex flex-col gap-4 py-8">
        {/* §312k BGB: always visible, also without login. */}
        <Link
          href="/kuendigen"
          className="inline-flex min-h-12 w-fit items-center rounded-xl border-2 border-fg px-4 font-semibold"
        >
          {t('common.footer.cancelContract')}
        </Link>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="inline-block py-2 underline">
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">© ParkShield</p>
      </Container>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
