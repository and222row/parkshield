'use client';

import { Container, Heading, LanguageSwitch, Stack, Text, useI18n } from '@parkshield/ui';
import Link from 'next/link';

export default function Home() {
  const { t } = useI18n();
  return (
    <main id="main">
      <Container className="py-10">
        <Stack gap={6}>
          <div className="flex items-center justify-between">
            <Heading level={1}>{t('common.appName')}</Heading>
            <LanguageSwitch />
          </div>
          <Text muted>{t('design.intro')}</Text>
          <Link className="font-semibold text-primary underline" href="/design">
            {t('design.title')}
          </Link>
        </Stack>
      </Container>
    </main>
  );
}
