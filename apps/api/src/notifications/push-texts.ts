/** Short texts for push notifications (lock screen). Kept here because they must stay tiny. */
const texts = {
  de: {
    alert: (type: string, nickname: string) => ({
      title: `${type}: ${nickname}`,
      body: 'Jemand hat Ihren ParkShield-Aufkleber gescannt.',
    }),
    test: (_type: string, nickname: string) => ({
      title: `Test erfolgreich: ${nickname}`,
      body: 'So kommen Warnungen bei Ihnen an.',
    }),
    followup: (type: string, nickname: string) => ({
      title: `Erinnerung: ${nickname}`,
      body: `Die Person wartet noch (${type}).`,
    }),
  },
  en: {
    alert: (type: string, nickname: string) => ({
      title: `${type}: ${nickname}`,
      body: 'Someone scanned your ParkShield decal.',
    }),
    test: (_type: string, nickname: string) => ({
      title: `Test successful: ${nickname}`,
      body: 'This is how alerts reach you.',
    }),
    followup: (type: string, nickname: string) => ({
      title: `Reminder: ${nickname}`,
      body: `The person is still waiting (${type}).`,
    }),
  },
};

export type PushKind = keyof (typeof texts)['de'];

export function pushText(lang: 'de' | 'en', kind: PushKind, type: string, nickname: string) {
  return texts[lang][kind](type, nickname);
}
