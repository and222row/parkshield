'use client';

import type { MessageKey } from '@parkshield/i18n';
import { PLAN_PRICES_CENTS } from '@parkshield/shared';
import { Badge, Card, Container, Heading, Stack, Text, useI18n } from '@parkshield/ui';
import Link from 'next/link';
import { PageShell } from './site-chrome';

const keys = <P extends string>(prefix: P, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}` as MessageKey);

function useEuro() {
  const { locale } = useI18n();
  return (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
    }).format(cents / 100);
}

function FeatureList({ items }: { items: MessageKey[] }) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-col gap-2">
      {items.map((k) => (
        <li key={k} className="flex gap-2">
          <span aria-hidden="true" className="font-bold text-primary">
            ✓
          </span>
          <span>{t(k)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Landing() {
  const { t } = useI18n();
  const euro = useEuro();
  const linkButton =
    'inline-flex min-h-12 items-center justify-center rounded-xl px-5 font-semibold transition';

  return (
    <PageShell>
      <section className="bg-surface">
        <Container className="py-14">
          <Stack gap={6}>
            <Heading level={1} className="text-4xl sm:text-5xl">
              {t('landing.heroTitle')}
            </Heading>
            <Text className="max-w-2xl text-lg">{t('landing.heroText')}</Text>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/konto"
                className={`${linkButton} bg-primary text-primary-fg hover:bg-primary-hover`}
              >
                {t('landing.heroCta')}
              </Link>
              <Link
                href="#so-funktionierts"
                className={`${linkButton} bg-secondary text-secondary-fg`}
              >
                {t('landing.heroSecondary')}
              </Link>
            </div>
            <Text muted>{t('landing.trust')}</Text>
          </Stack>
        </Container>
      </section>

      <Container className="py-12">
        <section id="so-funktionierts" aria-labelledby="how" className="scroll-mt-20">
          <Heading level={2} id="how" className="mb-6">
            {t('landing.howTitle')}
          </Heading>
          <ol className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <Card className="h-full">
                  <p aria-hidden="true" className="mb-2 text-3xl font-bold text-primary">
                    {n}
                  </p>
                  <Heading level={3} className="mb-2">
                    {t(`landing.step${n}Title` as MessageKey)}
                  </Heading>
                  <Text>{t(`landing.step${n}Text` as MessageKey)}</Text>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="features" className="mt-14">
          <Heading level={2} id="features" className="mb-6">
            {t('landing.featuresTitle')}
          </Heading>
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((n) => (
              <Card key={n}>
                <Heading level={3} className="mb-2">
                  {t(`landing.feature${n}Title` as MessageKey)}
                </Heading>
                <Text>{t(`landing.feature${n}Text` as MessageKey)}</Text>
              </Card>
            ))}
          </div>
        </section>

        <section id="preise" aria-labelledby="pricing" className="mt-14 scroll-mt-20">
          <Heading level={2} id="pricing" className="mb-2">
            {t('landing.pricingTitle')}
          </Heading>
          <Text muted className="mb-6">
            {t('landing.pricingNote')}
          </Text>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col gap-4 border-2 border-primary">
              <div>
                <Heading level={3}>{t('landing.plusName')}</Heading>
                <Text muted>{t('landing.plusFor')}</Text>
              </div>
              <p className="text-3xl font-bold">
                {t('landing.priceInclVat', { price: euro(PLAN_PRICES_CENTS.plus) })}
              </p>
              <FeatureList items={keys('landing.plusF', 6)} />
              <Link
                href="/konto"
                className={`${linkButton} mt-auto bg-primary text-primary-fg hover:bg-primary-hover`}
              >
                {t('landing.plusCta')}
              </Link>
            </Card>
            <Card className="flex flex-col gap-4">
              <div>
                <Heading level={3}>{t('landing.premiumName')}</Heading>
                <Text muted>{t('landing.premiumFor')}</Text>
              </div>
              <p className="text-3xl font-bold">
                {t('landing.priceInclVat', { price: euro(PLAN_PRICES_CENTS.premium) })}
              </p>
              <FeatureList items={keys('landing.premiumF', 5)} />
              <Badge tone="info" className="mt-auto w-fit">
                {t('landing.premiumSoon')}
              </Badge>
            </Card>
            <Card className="flex flex-col gap-4">
              <div>
                <Heading level={3}>{t('landing.businessName')}</Heading>
                <Text muted>{t('landing.businessFor')}</Text>
              </div>
              <Badge tone="warning" className="w-fit">
                {t('landing.businessSoon')}
              </Badge>
              <Text>{t('landing.businessText')}</Text>
              <Link
                href="/business"
                className={`${linkButton} mt-auto bg-secondary text-secondary-fg`}
              >
                {t('landing.businessCta')}
              </Link>
            </Card>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-title" className="mt-14 scroll-mt-20">
          <Heading level={2} id="faq-title" className="mb-6">
            {t('landing.faqTitle')}
          </Heading>
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <details key={n} className="rounded-xl border border-border bg-surface px-4">
                <summary className="flex min-h-12 cursor-pointer items-center font-semibold">
                  {t(`landing.faq${n}Q` as MessageKey)}
                </summary>
                <Text className="pb-4">{t(`landing.faq${n}A` as MessageKey)}</Text>
              </details>
            ))}
          </div>
        </section>
      </Container>
    </PageShell>
  );
}
