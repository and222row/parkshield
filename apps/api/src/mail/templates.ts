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
    payment_failed: {
      subject: 'Ihre Zahlung für ParkShield hat nicht geklappt',
      lines: [
        'Wir konnten die Verlängerung Ihres Abos nicht abbuchen. Ihr Schutz bleibt vorerst aktiv.',
        'Wir versuchen es am {nextAttemptAt, date, long} erneut. Bitte prüfen Sie bis dahin Ihre Zahlungsmethode.',
      ],
      action: 'Zahlungsmethode prüfen',
    },
    payment_failed_final: {
      subject: 'Ihr ParkShield-Schutz endet',
      lines: [
        'Auch der letzte Versuch, die Verlängerung abzubuchen, ist fehlgeschlagen. Ihr Abo endet, und Ihre Aufkleber werden inaktiv.',
        'Sie können jederzeit in Ihrem Konto ein neues Abo abschließen.',
      ],
      action: 'Zum Konto',
    },
    order_received: {
      subject: 'Ihr Aufkleber ist in Produktion',
      lines: [
        'Wir drucken Ihren ParkShield-Aufkleber für „{nickname}“. Der Versand dauert meist 3 bis 5 Werktage.',
        'Bis er ankommt, können Sie das PDF zum Selbstausdrucken nutzen.',
      ],
      action: 'PDF herunterladen',
    },
    alert_received: {
      subject: '{type}: „{nickname}“',
      lines: [
        'Jemand hat gerade Ihren ParkShield-Aufkleber an „{nickname}“ gescannt: {type}.',
        '{hasMessage, select, yes {Nachricht: „{message}“} other {}}',
        'Die Person sieht, dass Ihre Warnung angekommen ist.',
      ],
      action: 'Zum Konto',
    },
    alert_test: {
      subject: 'Test erfolgreich: „{nickname}“',
      lines: [
        'Ihr Aufkleber an „{nickname}“ funktioniert. So kommen Warnungen bei Ihnen an.',
        'Tipp: Schalten Sie zusätzlich Push oder WhatsApp ein, damit Sie Warnungen sofort sehen.',
      ],
      action: 'Zum Konto',
    },
    decal_shipped: {
      subject: 'Ihr Aufkleber ist unterwegs',
      lines: [
        'Ihr ParkShield-Aufkleber für „{nickname}“ wurde versandt. Sendungsnummer: {trackingNumber}.',
        'Bringen Sie ihn nach der Ankunft an und testen Sie ihn einmal: erst dann ist Ihr Schutz vollständig.',
      ],
      action: 'Zum Fahrzeug',
    },
    push_removed: {
      subject: 'Push-Benachrichtigungen auf {device} ausgeschaltet',
      lines: [
        'Wir konnten Push-Benachrichtigungen an {device} nicht mehr zustellen und haben das Gerät deshalb entfernt.',
        'Warnungen erreichen Sie weiter per E-Mail. Öffnen Sie Ihr Konto auf dem Gerät, um Push wieder einzuschalten.',
      ],
      action: 'Push wieder einschalten',
    },
    alert_followup: {
      subject: 'Erinnerung: Jemand wartet an „{nickname}“',
      lines: [
        'Die Person, die Sie wegen „{nickname}“ gewarnt hat ({type}), wartet noch auf Sie.',
        'Bitte kommen Sie zum Fahrzeug oder antworten Sie kurz, damit sie Bescheid weiß.',
      ],
      action: 'Antworten',
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
    payment_failed: {
      subject: 'Your ParkShield payment did not go through',
      lines: [
        'We could not collect the renewal of your subscription. Your protection stays active for now.',
        'We will try again on {nextAttemptAt, date, long}. Please check your payment method before then.',
      ],
      action: 'Check payment method',
    },
    payment_failed_final: {
      subject: 'Your ParkShield protection is ending',
      lines: [
        'The last attempt to collect your renewal also failed. Your subscription ends and your decals become inactive.',
        'You can start a new subscription in your account at any time.',
      ],
      action: 'Open my account',
    },
    order_received: {
      subject: 'Your decal is being printed',
      lines: [
        'We are printing your ParkShield decal for “{nickname}”. Delivery usually takes 3 to 5 working days.',
        'Until it arrives, you can use the print-at-home PDF.',
      ],
      action: 'Download PDF',
    },
    alert_received: {
      subject: '{type}: “{nickname}”',
      lines: [
        'Someone just scanned your ParkShield decal on “{nickname}”: {type}.',
        '{hasMessage, select, yes {Message: “{message}”} other {}}',
        'They can see that your alert has arrived.',
      ],
      action: 'Open my account',
    },
    alert_test: {
      subject: 'Test successful: “{nickname}”',
      lines: [
        'Your decal on “{nickname}” works. This is how alerts reach you.',
        'Tip: also turn on Push or WhatsApp so you see alerts immediately.',
      ],
      action: 'Open my account',
    },
    decal_shipped: {
      subject: 'Your decal is on its way',
      lines: [
        'Your ParkShield decal for “{nickname}” has been shipped. Tracking number: {trackingNumber}.',
        'Once it arrives, apply it and test it once: only then is your protection complete.',
      ],
      action: 'Open vehicle',
    },
    push_removed: {
      subject: 'Push notifications turned off on {device}',
      lines: [
        'We could no longer deliver push notifications to {device}, so we removed the device.',
        'Alerts still reach you by e-mail. Open your account on that device to turn push back on.',
      ],
      action: 'Turn push back on',
    },
    alert_followup: {
      subject: 'Reminder: someone is waiting at “{nickname}”',
      lines: [
        'The person who alerted you about “{nickname}” ({type}) is still waiting for you.',
        'Please go to your vehicle or send a short reply so they know.',
      ],
      action: 'Reply',
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
  const lines = src.lines.map(fmt).filter((l) => l.trim() !== ''); // optional lines render empty
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
