import { describe, expect, it } from 'vitest';
import { mailTemplates, renderMail, type MailTemplate } from './templates';

const names = Object.keys(mailTemplates.de) as MailTemplate[];
const values = {
  when: new Date('2027-08-03T09:15:00Z'),
  receivedAt: new Date('2027-08-03T09:15:00Z'),
  endsAt: new Date('2028-08-03T00:00:00Z'),
  periodEnd: new Date('2028-08-03T00:00:00Z'),
  device: 'Chrome · Windows',
  plan: 'Plus',
  contractNo: 'PS-7K3Q9X2M',
  company: 'Malermeister <Schulz> GmbH',
  nextAttemptAt: new Date('2028-08-06T00:00:00Z'),
  nickname: 'Der Blaue',
  trackingNumber: '00340434161234567890',
};

describe('mail templates', () => {
  it('DE and EN define the same templates with the same structure', () => {
    expect(Object.keys(mailTemplates.en).sort()).toEqual([...names].sort());
    for (const n of names) {
      const de: { lines: string[]; action?: string } = mailTemplates.de[n];
      const en: { lines: string[]; action?: string } = mailTemplates.en[n];
      expect(en.lines.length, n).toBe(de.lines.length);
      expect(Boolean(en.action), n).toBe(Boolean(de.action));
    }
  });

  it.each(names)('%s renders in both locales without leftover placeholders', (name) => {
    for (const locale of ['de', 'en'] as const) {
      const r = renderMail(name, locale, values, 'https://parkshield.de/x');
      expect(r.subject + r.text).not.toMatch(/[{}]/);
    }
  });

  it('formats dates in German time and escapes HTML', () => {
    const r = renderMail('waitlist_confirm', 'de', values, 'https://parkshield.de/b?x=1&y=2');
    expect(r.html).toContain('Malermeister &lt;Schulz&gt; GmbH');
    expect(r.html).toContain('href="https://parkshield.de/b?x=1&amp;y=2"');
    const c = renderMail('cancel_received', 'de', values);
    expect(c.text).toContain('3. August 2027 um 11:15');
  });
});
