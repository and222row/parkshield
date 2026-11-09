'use client';

import {
  Badge,
  Card,
  Container,
  Heading,
  LanguageSwitch,
  Stack,
  Text,
  useI18n,
} from '@parkshield/ui';

export function ApiStatus({ reachable }: { reachable: boolean }) {
  const { t } = useI18n();
  return (
    <main id="main">
      <Container className="py-10">
        <Stack gap={6}>
          <div className="flex items-center justify-between">
            <Heading level={1}>{t('ops.title')}</Heading>
            <LanguageSwitch />
          </div>
          <Text muted>{t('ops.vpnOnly')}</Text>
          <Card className="flex items-center justify-between">
            <span className="font-semibold">{t('ops.apiStatus')}</span>
            <Badge tone={reachable ? 'success' : 'danger'}>
              {reachable ? t('ops.apiUp') : t('ops.apiDown')}
            </Badge>
          </Card>
        </Stack>
      </Container>
    </main>
  );
}
