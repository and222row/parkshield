'use client';

import { Button, Container, LanguageSwitch, Text, useI18n } from '@parkshield/ui';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { opsApi } from '@/lib/api';
import type { StaffMe } from '@/lib/server';

const IDLE_MS = 30 * 60_000;

/**
 * Frame for signed-in pages. The server ends a staff session after 30 min without a request; this
 * timer also leaves the page after 30 min without input, so nothing stays open on an unattended screen.
 */
export function OpsShell({ me, children }: { me: StaffMe; children: ReactNode }) {
  const { t } = useI18n();

  useEffect(() => {
    let timer = setTimeout(leave, IDLE_MS);
    function leave() {
      window.location.assign('/anmelden?abgelaufen=1');
    }
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(leave, IDLE_MS);
    };
    const events = ['pointerdown', 'keydown'] as const;
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  async function logout() {
    await opsApi('/ops/v1/auth/logout', { body: {} }).catch(() => {});
    window.location.assign('/anmelden');
  }

  const canManageStaff = me.permissions.includes('staff.manage');
  return (
    <>
      <header className="border-b border-border">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-3">
          <nav aria-label="Ops" className="flex items-center gap-4">
            <Link href="/" className="font-bold">
              {t('ops.title')}
            </Link>
            <Link href="/" className="text-primary underline">
              {t('ops.navHome')}
            </Link>
            {canManageStaff && (
              <Link href="/mitarbeitende" className="text-primary underline">
                {t('ops.navStaff')}
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <Text muted className="text-sm">
              {t('ops.welcome', { email: me.email })}
            </Text>
            <LanguageSwitch />
            <Button variant="secondary" onClick={logout}>
              {t('ops.logout')}
            </Button>
          </div>
        </Container>
      </header>
      <main id="main">
        <Container className="py-8">{children}</Container>
      </main>
    </>
  );
}
