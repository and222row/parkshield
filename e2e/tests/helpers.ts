import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export const uniqueEmail = (name: string) =>
  `${name}+${Date.now()}${Math.floor(Math.random() * 1000)}@example.de`;

interface Mail {
  to: string;
  tag: string;
  text: string;
}

/** Waits for a mail in the local dev inbox (fake Brevo). */
export async function waitForMail(
  request: APIRequestContext,
  to: string,
  tag: string,
): Promise<Mail> {
  let found: Mail | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${API_URL}/v1/dev/mailbox`);
        const { mails } = (await res.json()) as { mails: Mail[] };
        found = mails.find((m) => m.to === to && m.tag === tag);
        return Boolean(found);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return found!;
}

export function linkIn(mail: Mail): string {
  const m = /(https?:\/\/\S+)/.exec(mail.text);
  if (!m) throw new Error(`no link in ${mail.tag}`);
  return m[1]!;
}

export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .exclude('nextjs-portal')
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

/** Signs up through the real UI and the e-mailed magic link; ends on /konto. */
export async function signUp(page: Page, request: APIRequestContext, email: string) {
  await page.goto('/anmelden');
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByRole('button', { name: 'Link senden' }).click();
  await expect(page.getByText('Fast geschafft!')).toBeVisible();
  const mail = await waitForMail(request, email, 'magic_link');
  await page.goto(linkIn(mail));
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/konto$/);
  await expect(page.getByText(`Angemeldet als ${email}`)).toBeVisible();
}
