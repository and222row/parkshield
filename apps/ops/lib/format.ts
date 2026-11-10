/** Short date and time for tables (client and server). */
export const fmt = (v: string | Date | null | undefined, locale: string) =>
  v
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Berlin',
      }).format(new Date(v))
    : '–';
