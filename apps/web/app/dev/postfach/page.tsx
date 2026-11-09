'use client';

import { Card, Container, Heading, Stack, Text, useI18n } from '@parkshield/ui';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

interface Mail {
  to: string;
  subject: string;
  text: string;
  tag: string;
  sentAt: string;
}

const linkify = (text: string) =>
  text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} className="break-all text-primary underline">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );

/** Local inbox for mails sent while BREVO_API_KEY is empty. */
export default function DevInbox() {
  const { t } = useI18n();
  const [mails, setMails] = useState<Mail[] | null>(null);
  useEffect(() => {
    const load = () =>
      api<{ mails: Mail[] }>('/v1/dev/mailbox').then(
        (r) => setMails(r.mails),
        () => setMails([]),
      );
    void load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main id="main">
      <Container className="py-10">
        <Stack gap={4}>
          <Heading level={1}>{t('dev.inboxTitle')}</Heading>
          <Text muted>{t('dev.inboxIntro')}</Text>
          {mails?.length === 0 && <Text>{t('dev.inboxEmpty')}</Text>}
          {mails?.map((m) => (
            <Card key={m.sentAt + m.tag}>
              <Stack gap={2}>
                <Heading level={2} className="text-lg">
                  {m.subject}
                </Heading>
                <Text muted className="text-sm">
                  {t('dev.to', { to: m.to })} · {new Date(m.sentAt).toLocaleString()} · {m.tag}
                </Text>
                <div className="whitespace-pre-wrap">{linkify(m.text)}</div>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Container>
    </main>
  );
}
