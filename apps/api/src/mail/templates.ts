import { IntlMessageFormat } from 'intl-messageformat';

export type MailLocale = 'de' | 'en';

interface TemplateSource {
  subject: string;
  lines: string[];
  action?: string;
}

const templates = {
  de: {
    magic_link: {
      subject: 'Ihr Anmeldelink für ParkShield',
      lines: [
        'Hallo,',
        'mit diesem Link melden Sie sich bei ParkShield an. Er ist 15 Minuten gültig und funktioniert nur einmal.',
        'Wenn Sie keinen Link angefordert haben, können Sie diese E-Mail ignorieren.',
      ],
      action: 'Jetzt anmelden',
    },
    new_device: {
      subject: 'Neue Anmeldung bei ParkShield',
      lines: [
        'Ihr Konto wurde am {when, date, long} um {when, time, short} auf einem neuen Gerät verwendet: {device}.',
        'Waren Sie das nicht? Melden Sie sich an und entfernen Sie unbekannte Geräte, oder antworten Sie auf diese E-Mail.',
      ],
    },
    subscription_started: {
      subject: 'Willkommen bei ParkShield {plan}',
      lines: [
        'Vielen Dank! Ihr Abo {plan} ist aktiv bis zum {periodEnd, date, long}.',
        'Ihre Vertragsnummer: {contractNo}. Sie brauchen sie, wenn Sie ohne Anmeldung kündigen möchten.',
        'Sie haben verlangt, dass die Leistung sofort beginnt. Bei einem Widerruf innerhalb von 14 Tagen zahlen Sie Wertersatz für die bis dahin erbrachte Leistung.',
        'Ihre Rechnung finden Sie in Ihrem Konto.',
      ],
      action: 'Zum Konto',
    },
    cancel_received: {
      subject: 'Ihre Kündigung ist eingegangen',
      lines: [
        'Wir haben Ihre Kündigung am {receivedAt, date, long} um {receivedAt, time, short} erhalten.',
        'Vertragsnummer: {contractNo}. Ihr Abo endet zum {endsAt, date, long}. Bis dahin bleibt Ihr Schutz aktiv.',
        'Sie müssen nichts weiter tun.',
      ],
    },
    cancel_not_found: {
      subject: 'Ihre Kündigung bei ParkShield',
      lines: [
        'Wir haben am {receivedAt, date, long} um {receivedAt, time, short} eine Kündigung für diese E-Mail-Adresse erhalten.',
        'Zur angegebenen Vertragsnummer haben wir keinen aktiven Vertrag gefunden. Bitte prüfen Sie die Vertragsnummer in Ihrer Willkommens-E-Mail oder antworten Sie auf diese E-Mail.',
      ],
    },
    waitlist_confirm: {
      subject: 'Bitte bestätigen Sie Ihre Anmeldung zur Business-Warteliste',
      lines: [
        'Sie haben {company} für die Warteliste von ParkShield Business eingetragen.',
        'Bitte bestätigen Sie die Anmeldung. Ohne Bestätigung löschen wir die Angaben nach 30 Tagen.',
      ],
      action: 'Anmeldung bestätigen',
    },
  },
  en: {
    magic_link: {
      subject: 'Your ParkShield sign-in link',
      lines: [
        'Hello,',
        'use this link to sign in to ParkShield. It is valid for 15 minutes and works only once.',
        'If you did not request a link, you can ignore this e-mail.',
      ],
      action: 'Sign in now',
    },
    new_device: {
      subject: 'New sign-in to ParkShield',
      lines: [
        'Your account was used on a new device on {when, date, long} at {when, time, short}: {device}.',
        'Not you? Sign in and remove unknown devices, or reply to this e-mail.',
      ],
    },
    subscription_started: {
      subject: 'Welcome to ParkShield {plan}',
      lines: [
        'Thank you! Your {plan} subscription is active until {periodEnd, date, long}.',
        'Your contract number: {contractNo}. You need it to cancel without signing in.',
        'You asked for the service to start immediately. If you withdraw within 14 days, you pay for the service provided until then.',
        'Your invoice is available in your account.',
      ],
      action: 'Open my account',
    },
    cancel_received: {
      subject: 'We have received your cancellation',
      lines: [
        'We received your cancellation on {receivedAt, date, long} at {receivedAt, time, short}.',
        'Contract number: {contractNo}. Your subscription ends on {endsAt, date, long}. Your protection stays active until then.',
        'There is nothing else you need to do.',
      ],
    },
    cancel_not_found: {
      subject: 'Your ParkShield cancellation',
      lines: [
        'We received a cancellation for this e-mail address on {receivedAt, date, long} at {receivedAt, time, short}.',
        'We could not find an active contract with the contract number you entered. Please check the number in your welcome e-mail or reply to this e-mail.',
      ],
    },
    waitlist_confirm: {
      subject: 'Please confirm your ParkShield Business waitlist sign-up',
      lines: [
        'You added {company} to the ParkShield Business waitlist.',
        'Please confirm. Without confirmation we delete the details after 30 days.',
      ],
      action: 'Confirm sign-up',
    },
  },
} satisfies Record<MailLocale, Record<string, TemplateSource>>;

export type MailTemplate = keyof (typeof templates)['de'];
export type MailValues = Record<string, string | number | Date>;
export { templates as mailTemplates };

const TZ = 'Europe/Berlin';
const BERLIN_FORMATS = {
  date: { long: { year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ } },
  time: { short: { hour: 'numeric', minute: '2-digit', timeZone: TZ } },
} as const;

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function renderMail(
  template: MailTemplate,
  locale: MailLocale,
  values: MailValues,
  actionUrl?: string,
): { subject: string; text: string; html: string } {
  const src: TemplateSource = templates[locale][template];
  const fmt = (s: string) =>
    String(new IntlMessageFormat(s, locale, BERLIN_FORMATS).format(values));
  const subject = fmt(src.subject);
  const lines = src.lines.map(fmt);
  const action = src.action && actionUrl ? { label: fmt(src.action), url: actionUrl } : undefined;

  const text = [
    ...lines,
    ...(action ? ['', `${action.label}: ${action.url}`] : []),
    '',
    '— ParkShield',
  ].join('\n\n');
  const html = `<!doctype html><html lang="${locale}"><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.5;color:#0f172a">
${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('\n')}
${action ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>` : ''}
<p style="color:#475569">— ParkShield</p></body></html>`;
  return { subject, text, html };
}
