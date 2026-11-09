import { ApiStatus } from './api-status';

export const dynamic = 'force-dynamic';

async function opsApiReachable(): Promise<boolean> {
  const host = process.env.OPS_API_HOST ?? '127.0.0.1';
  const port = process.env.OPS_API_PORT ?? '4001';
  try {
    const res = await fetch(`http://${host}:${port}/ops/v1/health`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function OpsHome() {
  return <ApiStatus reachable={await opsApiReachable()} />;
}
