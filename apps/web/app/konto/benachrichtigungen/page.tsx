import { redirect } from 'next/navigation';
import { serverApi, type ChannelsOverview } from '@/lib/api-server';
import { NotificationsView } from './notifications-view';

export const metadata = { title: 'Benachrichtigungen', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const res = await serverApi<ChannelsOverview>('/v1/channels');
  if (res.status === 401 || !res.data) redirect('/anmelden');
  return <NotificationsView initial={res.data} />;
}
